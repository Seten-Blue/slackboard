import { Response } from 'express';
import jwt from 'jsonwebtoken';
import trelloService from '../services/trelloService';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { encryptToken, decryptToken, isEncryptedToken } from '../utils/crypto';

async function getUserTrelloToken(userId: string): Promise<{ token?: string; hasToken: boolean }> {
  const user = await User.findById(userId).select('trelloToken');
  const raw = user ? (user as any).trelloToken : null;
  let token: string | null = null;
  try {
    token = raw ? decryptToken(raw) : null;
  } catch (decryptErr: any) {
    console.error('❌ No se pudo descifrar el token de Trello:', decryptErr.message);
    token = null;
  }
  if (token && raw && !isEncryptedToken(raw)) {
    await User.updateOne({ _id: userId }, { trelloToken: encryptToken(raw) });
  }
  return { token: token ?? undefined, hasToken: !!token };
}

function requireTrello(res: any, hasToken: boolean): boolean {
  if (!hasToken && !trelloService.isConfigured()) {
    res.status(400).json({
      success: false,
      message: 'Trello no esta configurado. Vincula tu cuenta de Trello en tu perfil.',
    });
    return false;
  }
  return true;
}

export const getBoards = async (req: AuthRequest, res: Response) => {
  try {
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const boards = await trelloService.getBoards(creds.token);
    res.json({ success: true, data: boards });
  } catch (error: any) {
    console.error('Error obteniendo tableros de Trello:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener tableros', error: error.message });
  }
};

export const getBoardContents = async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const [lists, cardsRaw, members] = await Promise.all([
      trelloService.getLists(boardId, creds.token),
      trelloService.getCardsByBoard(boardId, creds.token),
      trelloService.getBoardMembers(boardId, creds.token),
    ]);

    // /boards/{id}/cards devuelve cover sin los `scaled` (no renderiza la
    // portada). Para cada tarjeta con portada por adjunto pega /cards/{id}
    // en paralelo y enriquece el cover para que el frontend pueda pintarla.
    const cards = cardsRaw.slice();
    const needCover = cards.filter((c: any) => c && c.cover && (c.cover.idAttachment || c.cover.idUploadedBackground) && !c.cover.scaled && !c.cover.url);
    if (needCover.length > 0) {
      const settled = await Promise.allSettled(needCover.map((c: any) => trelloService.getCardCover(c.id, creds.token)));
      const coverByCard = new Map<string, any>();
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled' && s.value?.cover) coverByCard.set(needCover[i].id, s.value.cover);
      });
      cards.forEach((c: any) => {
        const full = coverByCard.get(c.id);
        if (full) c.cover = full;
      });
    }

    res.json({ success: true, data: { lists, cards, members } });
  } catch (error: any) {
    console.error('Error obteniendo contenido del tablero:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener el tablero', error: error.message });
  }
};

export const createList = async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Se requiere name' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const list = await trelloService.createList(boardId, name, creds.token);
    res.status(201).json({ success: true, data: list });
  } catch (error: any) {
    console.error('Error creando lista:', error.message);
    res.status(500).json({ success: false, message: 'Error al crear la lista', error: error.message });
  }
};

export const archiveList = async (req: AuthRequest, res: Response) => {
  try {
    const { listId } = req.params;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const list = await trelloService.archiveList(listId, creds.token);
    res.json({ success: true, data: list });
  } catch (error: any) {
    console.error('Error archivando lista:', error.message);
    res.status(500).json({ success: false, message: 'Error al archivar la lista', error: error.message });
  }
};

export const createCard = async (req: AuthRequest, res: Response) => {
  try {
    const { listId, name, desc } = req.body;
    if (!listId || !name) {
      return res.status(400).json({ success: false, message: 'Se requiere listId y name' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const card = await trelloService.createCard(listId, name, desc, creds.token);
    res.status(201).json({ success: true, data: card });
  } catch (error: any) {
    console.error('Error creando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al crear la tarjeta', error: error.message });
  }
};

export const updateCard = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const { name, desc, due, dueComplete, cover } = req.body;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const card = await trelloService.updateCard(cardId, { name, desc, due, dueComplete, cover }, creds.token);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('Error actualizando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la tarjeta', error: error.message });
  }
};

export const moveCard = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const { listId, pos } = req.body;
    if (!listId) {
      return res.status(400).json({ success: false, message: 'Se requiere listId' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const card = await trelloService.moveCard(cardId, listId, pos, creds.token);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('Error moviendo tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al mover la tarjeta', error: error.message });
  }
};

export const archiveCard = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const card = await trelloService.archiveCard(cardId, creds.token);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('Error archivando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al archivar la tarjeta', error: error.message });
  }
};

export const getBoardLabels = async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const labels = await trelloService.getLabels(boardId, creds.token);
    res.json({ success: true, data: labels });
  } catch (error: any) {
    console.error('Error obteniendo etiquetas:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener etiquetas', error: error.message });
  }
};

export const toggleCardLabel = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, labelId } = req.params;
    const { action } = req.body;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    if (action === 'remove') {
      await trelloService.removeLabelFromCard(cardId, labelId, creds.token);
    } else {
      await trelloService.addLabelToCard(cardId, labelId, creds.token);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error actualizando etiqueta:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la etiqueta', error: error.message });
  }
};

export const updateCheckItem = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, checklistId, itemId } = req.params;
    const { state } = req.body;
    if (!state || !['complete', 'incomplete'].includes(state)) {
      return res.status(400).json({ success: false, message: 'Se requiere state: complete | incomplete' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    await trelloService.updateCheckItem(cardId, checklistId, itemId, state, creds.token);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error actualizando check item:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar item de verificacion', error: error.message });
  }
};

export const getCardActions = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const actions = await trelloService.getCardActions(cardId, creds.token);
    res.json({ success: true, data: actions });
  } catch (error: any) {
    console.error('Error obteniendo acciones:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener actividad', error: error.message });
  }
};

export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Se requiere text' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const action = await trelloService.addComment(cardId, text.trim(), creds.token);
    res.status(201).json({ success: true, data: action });
  } catch (error: any) {
    console.error('Error agregando comentario:', error.message);
    res.status(500).json({ success: false, message: 'Error al agregar comentario', error: error.message });
  }
};

export const getCardAttachments = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const attachments = await trelloService.getAttachments(cardId, creds.token);
    res.json({ success: true, data: attachments });
  } catch (error: any) {
    console.error('Error obteniendo adjuntos:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos', error: error.message });
  }
};

export const addCardAttachmentUrl = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const { url, name } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'Se requiere una URL' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const attachment = await trelloService.addAttachmentByUrl(cardId, url, name, creds.token);
    res.status(201).json({ success: true, data: attachment });
  } catch (error: any) {
    console.error('Error adjuntando enlace:', error.message);
    res.status(500).json({ success: false, message: 'Error al adjuntar el enlace', error: error.message });
  }
};

export const uploadCardAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No se recibio ningun archivo' });
    }
    const creds = await getUserTrelloToken(req.userId!);
    if (!requireTrello(res, creds.hasToken)) return;
    const attachment = await trelloService.addAttachmentByFile(cardId, file.buffer, file.originalname, file.mimetype, creds.token);
    res.status(201).json({ success: true, data: attachment });
  } catch (error: any) {
    console.error('Error subiendo archivo a Trello:', error.message);
    res.status(500).json({ success: false, message: 'Error al subir el archivo', error: error.message });
  }
};

export const viewCardAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId, attachmentId } = req.params;

    // Los <img src> no pueden enviar Authorization, asi que el JWT se
    // acepta tambien por query string (solo en este endpoint publico).
    let userId = req.userId;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    if (!userId && queryToken) {
      try {
        const payload: any = jwt.verify(queryToken, process.env.JWT_SECRET || '');
        userId = payload?.userId;
      } catch (tokenError) {
        // token invalido: se continua sin usuario y se devuelve el 403 amigable
      }
    }

    const creds = userId ? await getUserTrelloToken(userId) : { hasToken: false };

    const attachments = await trelloService.getAttachments(cardId, creds.token);
    const attachment = attachments.find((a: any) => a.id === attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    }

    // Orden de intento: original (mejor calidad) y luego los "previews" mas
    // grandes como respaldo si Trello bloquea el download directo.
    const previews = Array.isArray(attachment.previews)
      ? [...attachment.previews].sort((a: any, b: any) => (b.bytes || 0) - (a.bytes || 0))
      : [];
    const candidates = [attachment.url, ...previews.map((p: any) => p.url)];

    let buffer: Buffer | undefined;
    let contentType = 'application/octet-stream';
    let lastError: any;

    for (const url of candidates) {
      if (!url) continue;
      try {
        const result = await trelloService.fetchAttachmentBinary(url, creds.token);
        buffer = result.buffer;
        contentType = result.contentType;
        break;
      } catch (fetchError: any) {
        lastError = fetchError;
      }
    }

    if (!buffer) {
      const isPermission = /401|403|missing scopes|permission requested/i.test(lastError?.message || '');
      return res.status(isPermission ? 403 : 502).json({
        success: false,
        code: isPermission ? 'TRELLO_PERMISSION_DENIED' : 'TRELLO_DOWNLOAD_FAILED',
        message: isPermission
          ? 'El token de Trello no tiene permiso para descargar esta imagen. Vuelve a vincular tu cuenta o ábrela directamente en Trello.'
          : 'No se pudo descargar el adjunto desde Trello.',
      });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error obteniendo adjunto:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener el adjunto', error: error.message });
  }
};
