"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageController_1 = require("../controllers/messageController");
const router = express_1.default.Router();
// GET /api/messages/channel/:channelId - Obtener mensajes de un canal
router.get('/channel/:channelId', messageController_1.getMessagesByChannel);
// POST /api/messages - Crear un nuevo mensaje
router.post('/', messageController_1.createMessage);
// PUT /api/messages/:id - Actualizar un mensaje
router.put('/:id', messageController_1.updateMessage);
// DELETE /api/messages/:id - Eliminar un mensaje
router.delete('/:id', messageController_1.deleteMessage);
// POST /api/messages/:messageId/reaction - Agregar/quitar reacción
router.post('/:messageId/reaction', messageController_1.addReaction);
exports.default = router;
