
import express, { Request, Response } from 'express';
import trelloService from '../services/trelloService';

const router = express.Router();

// Obtener acciones recientes de un board (modificaciones, creaciones, comentarios, etc)
router.get('/boards/:boardId/actions', async (req, res) => {
  try {
    const { boardId } = req.params;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 20;
    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }
    const actions = await trelloService.getBoardActions(boardId, limit);
    res.json({
      success: true,
      data: actions,
      count: actions.length,
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo acciones del board:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo acciones del board',
      error: error.message,
    });
  }
});

// Estado de la integración
router.get('/status', (req: Request, res: Response) => {
  const configured = trelloService.isConfigured();
  res.json({
    success: true,
    configured: configured,
    message: configured
      ? 'Trello está configurado y funcionando'
      : 'Trello no está configurado. Verifica TRELLO_API_KEY y TRELLO_API_TOKEN en .env',
  });
});

// Obtener todos los boards
router.get('/boards', async (req: Request, res: Response) => {
  try {
    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    const boards = await trelloService.getBoards();

    res.json({
      success: true,
      data: boards,
      count: boards.length,
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo boards:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo boards',
      error: error.message,
    });
  }
});

// Obtener listas de un board
router.get('/boards/:boardId/lists', async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;

    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    const lists = await trelloService.getBoardLists(boardId);

    res.json({
      success: true,
      data: lists,
      count: lists.length,
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo listas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo listas',
      error: error.message,
    });
  }
});

// Obtener tarjetas de un board
router.get('/boards/:boardId/cards', async (req: Request, res: Response) => {
  try {
    const { boardId } = req.params;

    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    const cards = await trelloService.getBoardCards(boardId);

    res.json({
      success: true,
      data: cards,
      count: cards.length,
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo tarjetas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo tarjetas',
      error: error.message,
    });
  }
});

// Sincronizar tarjetas de Trello con MongoDB
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const { boardId, channelId } = req.body;

    if (!boardId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere boardId',
      });
    }

    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    const syncedTasks = await trelloService.syncBoardCards(boardId, channelId);

    res.json({
      success: true,
      message: `${syncedTasks.length} tarjetas sincronizadas`,
      data: syncedTasks,
    });
  } catch (error: any) {
    console.error('❌ Error sincronizando:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error sincronizando tarjetas',
      error: error.message,
    });
  }
});

// Obtener tareas sincronizadas
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.query;

    const tasks = await trelloService.getSyncedTasks(
      channelId ? String(channelId) : undefined
    );

    res.json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  } catch (error: any) {
    console.error('❌ Error obteniendo tareas:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo tareas',
      error: error.message,
    });
  }
});

// Crear nueva tarjeta
router.post('/cards', async (req: Request, res: Response) => {
  try {
    const { name, desc, listId, dueDate, labels } = req.body;

    if (!name || !listId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere name y listId',
      });
    }

    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    const card = await trelloService.createCard({
      name,
      desc,
      listId,
      dueDate,
      labels,
    });

    res.status(201).json({
      success: true,
      message: 'Tarjeta creada exitosamente',
      data: card,
    });
  } catch (error: any) {
    console.error('❌ Error creando tarjeta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error creando tarjeta',
      error: error.message,
    });
  }
});

// Actualizar tarjeta
router.put('/cards/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const { name, desc, due, idList } = req.body;

    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    const card = await trelloService.updateCard(cardId, {
      name,
      desc,
      due,
      idList,
    });

    res.json({
      success: true,
      message: 'Tarjeta actualizada exitosamente',
      data: card,
    });
  } catch (error: any) {
    console.error('❌ Error actualizando tarjeta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error actualizando tarjeta',
      error: error.message,
    });
  }
});

// Eliminar tarjeta
router.delete('/cards/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;

    if (!trelloService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Trello no está configurado',
      });
    }

    await trelloService.deleteCard(cardId);

    res.json({
      success: true,
      message: 'Tarjeta eliminada exitosamente',
    });
  } catch (error: any) {
    console.error('❌ Error eliminando tarjeta:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error eliminando tarjeta',
      error: error.message,
    });
  }
});

export default router;