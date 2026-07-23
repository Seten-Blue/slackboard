import { Response } from 'express';
import trelloService from '../services/trelloService';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

async function getUserTrelloCredentials(userId: string): Promise<{ key?: string; token?: string; hasUserCredentials: boolean }> {
  const user = await User.findById(userId).select('trelloApiKey trelloToken');
  if (user && (user as any).trelloApiKey && (user as any).trelloToken) {
    return { key: (user as any).trelloApiKey, token: (user as any).trelloToken, hasUserCredentials: true };
  }
  return { hasUserCredentials: false };
}

function requireTrello(res: any, hasUserCredentials: boolean): boolean {
  if (!hasUserCredentials && !trelloService.isConfigured()) {
    res.status(400).json({
      success: false,
      message: 'Trello no esta configurado. Vincula tu cuenta de Trello en tu perfil o configura TRELLO_API_KEY y TRELLO_TOKEN en .env',
    });
    return false;
  }
  return true;
}

export const getBoards = async (req: AuthRequest, res: Response) => {
  try {
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const boards = await trelloService.getBoards(undefined, creds.key, creds.token);
    res.json({ success: true, data: boards });
  } catch (error: any) {
    console.error('Error obteniendo tableros de Trello:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener tableros', error: error.message });
  }
};

export const getBoardContents = async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const [lists, cards, members] = await Promise.all([
      trelloService.getLists(boardId, creds.key, creds.token),
      trelloService.getCardsByBoard(boardId, creds.key, creds.token),
      trelloService.getBoardMembers(boardId, creds.key, creds.token),
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const list = await trelloService.createList(boardId, name, creds.key, creds.token);
    res.status(201).json({ success: true, data: list });
  } catch (error: any) {
    console.error('Error creando lista:', error.message);
    res.status(500).json({ success: false, message: 'Error al crear la lista', error: error.message });
  }
};

export const archiveList = async (req: AuthRequest, res: Response) => {
  try {
    const { listId } = req.params;
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const list = await trelloService.archiveList(listId, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const card = await trelloService.createCard(listId, name, desc, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const card = await trelloService.updateCard(cardId, { name, desc, due, dueComplete, cover }, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const card = await trelloService.moveCard(cardId, listId, pos, creds.key, creds.token);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('Error moviendo tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al mover la tarjeta', error: error.message });
  }
};

export const archiveCard = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const card = await trelloService.archiveCard(cardId, creds.key, creds.token);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('Error archivando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al archivar la tarjeta', error: error.message });
  }
};

export const getBoardLabels = async (req: AuthRequest, res: Response) => {
  try {
    const { boardId } = req.params;
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const labels = await trelloService.getLabels(boardId, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    if (action === 'remove') {
      await trelloService.removeLabelFromCard(cardId, labelId, creds.key, creds.token);
    } else {
      await trelloService.addLabelToCard(cardId, labelId, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    await trelloService.updateCheckItem(cardId, checklistId, itemId, state, creds.key, creds.token);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error actualizando check item:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar item de verificacion', error: error.message });
  }
};

export const getCardActions = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const actions = await trelloService.getCardActions(cardId, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const action = await trelloService.addComment(cardId, text.trim(), creds.key, creds.token);
    res.status(201).json({ success: true, data: action });
  } catch (error: any) {
    console.error('Error agregando comentario:', error.message);
    res.status(500).json({ success: false, message: 'Error al agregar comentario', error: error.message });
  }
};

export const getCardAttachments = async (req: AuthRequest, res: Response) => {
  try {
    const { cardId } = req.params;
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const attachments = await trelloService.getAttachments(cardId, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const attachment = await trelloService.addAttachmentByUrl(cardId, url, name, creds.key, creds.token);
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
    const creds = await getUserTrelloCredentials(req.userId!);
    if (!requireTrello(res, creds.hasUserCredentials)) return;
    const attachment = await trelloService.addAttachmentByFile(cardId, file.buffer, file.originalname, file.mimetype, creds.key, creds.token);
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
    const creds = userId ? await getUserTrelloCredentials(userId) : { hasUserCredentials: false };

    const attachments = await trelloService.getAttachments(cardId, creds.key, creds.token);
    const attachment = attachments.find((a: any) => a.id === attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    }

    const { buffer, contentType } = await trelloService.fetchAttachmentBinary(attachment.url, creds.key, creds.token);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (error: any) {
    console.error('Error obteniendo adjunto:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener el adjunto', error: error.message });
  }
};
