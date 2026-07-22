import express from 'express';
import {
  getMessagesByChannel,
  createMessage,
  updateMessage,
  deleteMessage,
  addReaction,
  votePoll,
  replyToThread,
  getThreadReplies,
} from '../controllers/messageController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// ← TODAS las rutas de mensajes requieren estar logueado.
// Sin esto, req.userId seria undefined y cualquiera podria leer/escribir
// mensajes de cualquier canal, o hacerse pasar por otro usuario.
router.use(requireAuth);

// GET /api/messages/channel/:channelId - Obtener mensajes de un canal
router.get('/channel/:channelId', getMessagesByChannel);

// POST /api/messages - Crear un nuevo mensaje
router.post('/', createMessage);

// GET /api/messages/thread/:messageId/replies - Obtener respuestas de un hilo
router.get('/thread/:messageId/replies', getThreadReplies);

// POST /api/messages/:messageId/reply - Responder a un hilo
router.post('/:messageId/reply', replyToThread);

// PUT /api/messages/:id - Actualizar un mensaje
router.put('/:id', updateMessage);

// DELETE /api/messages/:id - Eliminar un mensaje
router.delete('/:id', deleteMessage);

// POST /api/messages/:messageId/reaction - Agregar/quitar reaccion
router.post('/:messageId/reaction', addReaction);

// POST /api/messages/:messageId/poll/vote - Votar en una encuesta
router.post('/:messageId/poll/vote', votePoll);

export default router;