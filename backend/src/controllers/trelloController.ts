import { Request, Response } from 'express';
import trelloService from '../services/trelloService';

export const getBoards = async (req: Request, res: Response) => {
  try {
    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado. Verifica TRELLO_API_KEY y TRELLO_API_TOKEN en .env',
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
    const { name, desc } = req.body;
    const card = await trelloService.updateCard(cardId, { name, desc });
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