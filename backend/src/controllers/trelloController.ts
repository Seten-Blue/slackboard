import { Request, Response } from 'express';
import trelloService from '../services/trelloService';

export const getBoards = async (req: Request, res: Response) => {
  try {
    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no esta configurado. Verifica TRELLO_API_KEY y TRELLO_TOKEN en .env',
      });
    }
    const boards = await trelloService.getBoards();
    res.json({ success: true, data: boards });
  } catch (error: any) {
    console.error('❌ Error obteniendo tableros de Trello:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener tableros', error: error.message });
  }
};

export const getBoardContents = async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const [lists, cards] = await Promise.all([
      trelloService.getLists(boardId),
      trelloService.getCardsByBoard(boardId),
    ]);
    res.json({ success: true, data: { lists, cards } });
  } catch (error: any) {
    console.error('❌ Error obteniendo contenido del tablero:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener el tablero', error: error.message });
  }
};

export const createList = async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Se requiere name' });
    }
    const list = await trelloService.createList(boardId, name);
    res.status(201).json({ success: true, data: list });
  } catch (error: any) {
    console.error('❌ Error creando lista:', error.message);
    res.status(500).json({ success: false, message: 'Error al crear la lista', error: error.message });
  }
};

// ← NUEVO
export const archiveList = async (req: Request, res: Response) => {
  try {
    const { listId } = req.params;
    const list = await trelloService.archiveList(listId);
    res.json({ success: true, data: list });
  } catch (error: any) {
    console.error('❌ Error archivando lista:', error.message);
    res.status(500).json({ success: false, message: 'Error al archivar la lista', error: error.message });
  }
};

export const createCard = async (req: Request, res: Response) => {
  try {
    const { listId, name, desc } = req.body;
    if (!listId || !name) {
      return res.status(400).json({ success: false, message: 'Se requiere listId y name' });
    }
    const card = await trelloService.createCard(listId, name, desc);
    res.status(201).json({ success: true, data: card });
  } catch (error: any) {
    console.error('❌ Error creando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al crear la tarjeta', error: error.message });
  }
};

export const updateCard = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { name, desc, due, dueComplete } = req.body;
    const card = await trelloService.updateCard(cardId, { name, desc, due, dueComplete });
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('❌ Error actualizando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la tarjeta', error: error.message });
  }
};

export const moveCard = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { listId, pos } = req.body;
    if (!listId) {
      return res.status(400).json({ success: false, message: 'Se requiere listId' });
    }
    const card = await trelloService.moveCard(cardId, listId, pos);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('❌ Error moviendo tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al mover la tarjeta', error: error.message });
  }
};

export const archiveCard = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const card = await trelloService.archiveCard(cardId);
    res.json({ success: true, data: card });
  } catch (error: any) {
    console.error('❌ Error archivando tarjeta:', error.message);
    res.status(500).json({ success: false, message: 'Error al archivar la tarjeta', error: error.message });
  }
};

// ← NUEVO: etiquetas
export const getBoardLabels = async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;
    const labels = await trelloService.getLabels(boardId);
    res.json({ success: true, data: labels });
  } catch (error: any) {
    console.error('❌ Error obteniendo etiquetas:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener etiquetas', error: error.message });
  }
};

export const toggleCardLabel = async (req: Request, res: Response) => {
  try {
    const { cardId, labelId } = req.params;
    const { action } = req.body; // 'add' | 'remove'
    if (action === 'remove') {
      await trelloService.removeLabelFromCard(cardId, labelId);
    } else {
      await trelloService.addLabelToCard(cardId, labelId);
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error actualizando etiqueta:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar la etiqueta', error: error.message });
  }
};

// ← NUEVO: adjuntos
export const getCardAttachments = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const attachments = await trelloService.getAttachments(cardId);
    res.json({ success: true, data: attachments });
  } catch (error: any) {
    console.error('❌ Error obteniendo adjuntos:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener adjuntos', error: error.message });
  }
};

export const addCardAttachmentUrl = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { url, name } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'Se requiere una URL' });
    }
    const attachment = await trelloService.addAttachmentByUrl(cardId, url, name);
    res.status(201).json({ success: true, data: attachment });
  } catch (error: any) {
    console.error('❌ Error adjuntando enlace:', error.message);
    res.status(500).json({ success: false, message: 'Error al adjuntar el enlace', error: error.message });
  }
};

export const uploadCardAttachment = async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No se recibio ningun archivo' });
    }
    const attachment = await trelloService.addAttachmentByFile(cardId, file.buffer, file.originalname, file.mimetype);
    res.status(201).json({ success: true, data: attachment });
  } catch (error: any) {
    console.error('❌ Error subiendo archivo a Trello:', error.message);
    res.status(500).json({ success: false, message: 'Error al subir el archivo', error: error.message });
  }
};

// ← NUEVO: sirve el binario de un adjunto como proxy autenticado.
// El frontend usa esta URL directo en <img src>, sin necesitar el token de Trello.
export const viewCardAttachment = async (req: Request, res: Response) => {
  try {
    const { cardId, attachmentId } = req.params;

    const attachments = await trelloService.getAttachments(cardId);
    const attachment = attachments.find((a: any) => a.id === attachmentId);

    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Adjunto no encontrado' });
    }

    const { buffer, contentType } = await trelloService.fetchAttachmentBinary(attachment.url);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (error: any) {
    console.error('❌ Error obteniendo adjunto:', error.message);
    res.status(500).json({ success: false, message: 'Error al obtener el adjunto', error: error.message });
  }
};
