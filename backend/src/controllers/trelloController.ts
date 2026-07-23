import { Response } from 'express';
import trelloService from '../services/trelloService';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

async function getUserTrelloToken(userId: string): Promise<{ token?: string; hasToken: boolean }> {
  const user = await User.findById(userId).select('trelloToken');
  if (user && (user as any).trelloToken) {
    return { token: (user as any).trelloToken, hasToken: true };
  }
  return { hasToken: false };
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
    const [lists, cards, members] = await Promise.all([
      trelloService.getLists(boardId, creds.token),
      trelloService.getCardsByBoard(boardId, creds.token),
      trelloService.getBoardMembers(boardId, creds.token),
    ]);
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
    const userId = req.userId;
    const creds = userId ? await getUserTrelloToken(userId) : { hasToken: false };

    const attachments = await trelloService.getAttachments(cardId, creds.token);
    const attachment = attachments.find((a: any) => a.id === attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    }

    const { buffer, contentType } = await trelloService.fetchAttachmentBinary(attachment.url, creds.token);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error obteniendo adjunto:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener el adjunto', error: error.message });
  }
};
