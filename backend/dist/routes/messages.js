"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageController_1 = require("../controllers/messageController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// ← TODAS las rutas de mensajes requieren estar logueado.
// Sin esto, req.userId seria undefined y cualquiera podria leer/escribir
// mensajes de cualquier canal, o hacerse pasar por otro usuario.
router.use(auth_1.requireAuth);
// GET /api/messages/channel/:channelId - Obtener mensajes de un canal
router.get('/channel/:channelId', messageController_1.getMessagesByChannel);
// POST /api/messages - Crear un nuevo mensaje
router.post('/', messageController_1.createMessage);
// GET /api/messages/thread/:messageId/replies - Obtener respuestas de un hilo
router.get('/thread/:messageId/replies', messageController_1.getThreadReplies);
// POST /api/messages/:messageId/reply - Responder a un hilo
router.post('/:messageId/reply', messageController_1.replyToThread);
// PUT /api/messages/:id - Actualizar un mensaje
router.put('/:id', messageController_1.updateMessage);
// DELETE /api/messages/:id - Eliminar un mensaje
router.delete('/:id', messageController_1.deleteMessage);
// POST /api/messages/:messageId/reaction - Agregar/quitar reaccion
router.post('/:messageId/reaction', messageController_1.addReaction);
// POST /api/messages/:messageId/poll/vote - Votar en una encuesta
router.post('/:messageId/poll/vote', messageController_1.votePoll);
exports.default = router;
