import express from 'express';
import {
  getBoards,
  getBoardContents,
  createCard,
  updateCard,
  moveCard,
  archiveCard,
  createList,
} from '../controllers/trelloController';

const router = express.Router();

// GET /api/trello/boards - todos los tableros del usuario
router.get('/boards', getBoards);

// GET /api/trello/boards/:boardId - listas + tarjetas de un tablero
router.get('/boards/:boardId', getBoardContents);

// POST /api/trello/boards/:boardId/lists - crear lista nueva
router.post('/boards/:boardId/lists', createList);

// POST /api/trello/cards - crear tarjeta
router.post('/cards', createCard);

// PUT /api/trello/cards/:cardId - editar nombre/descripción
router.put('/cards/:cardId', updateCard);

// PUT /api/trello/cards/:cardId/move - mover a otra lista
router.put('/cards/:cardId/move', moveCard);

// PUT /api/trello/cards/:cardId/archive - archivar (no se elimina, se archiva)
router.put('/cards/:cardId/archive', archiveCard);

export default router;