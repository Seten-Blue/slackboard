import express from 'express';
import {
  getMessagesByChannel,
  createMessage,
  updateMessage,
  deleteMessage,
  addReaction,
} from '../controllers/messageController';

const router = express.Router();

// GET /api/messages/channel/:channelId - Obtener mensajes de un canal
router.get('/channel/:channelId', getMessagesByChannel);

// POST /api/messages - Crear un nuevo mensaje
router.post('/', createMessage);

// PUT /api/messages/:id - Actualizar un mensaje
router.put('/:id', updateMessage);

// DELETE /api/messages/:id - Eliminar un mensaje
router.delete('/:id', deleteMessage);

// POST /api/messages/:messageId/reaction - Agregar/quitar reacción
router.post('/:messageId/reaction', addReaction);

export default router;