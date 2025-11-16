"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addReaction = exports.deleteMessage = exports.updateMessage = exports.createMessage = exports.getMessagesByChannel = void 0;
const Message_1 = __importDefault(require("../models/Message"));
const Channel_1 = __importDefault(require("../models/Channel"));
const User_1 = __importDefault(require("../models/User"));
// Obtener mensajes de un canal
const getMessagesByChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const { limit = 50, skip = 0 } = req.query;
        const messages = await Message_1.default.find({ channel: channelId })
            .populate('sender', 'username email avatar status')
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .skip(Number(skip));
        const total = await Message_1.default.countDocuments({ channel: channelId });
        res.json({
            success: true,
            count: messages.length,
            total,
            data: messages.reverse(), // Ordenar de más antiguo a más reciente
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener mensajes',
            error: error.message,
        });
    }
};
exports.getMessagesByChannel = getMessagesByChannel;
// Crear un nuevo mensaje
const createMessage = async (req, res) => {
    try {
        const { content, channel, sender, type = 'text' } = req.body;
        // Verificar que el canal existe
        const channelExists = await Channel_1.default.findById(channel);
        if (!channelExists) {
            return res.status(404).json({
                success: false,
                message: 'Canal no encontrado',
            });
        }
        // Verificar que el usuario existe
        const userExists = await User_1.default.findById(sender);
        if (!userExists) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado',
            });
        }
        const message = await Message_1.default.create({
            content,
            channel,
            sender,
            type,
        });
        const populatedMessage = await Message_1.default.findById(message._id)
            .populate('sender', 'username email avatar status');
        res.status(201).json({
            success: true,
            message: 'Mensaje enviado',
            data: populatedMessage,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al crear mensaje',
            error: error.message,
        });
    }
};
exports.createMessage = createMessage;
// Editar un mensaje
const updateMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const message = await Message_1.default.findByIdAndUpdate(id, { content, isEdited: true }, { new: true }).populate('sender', 'username email avatar status');
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Mensaje no encontrado',
            });
        }
        res.json({
            success: true,
            message: 'Mensaje actualizado',
            data: message,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al actualizar mensaje',
            error: error.message,
        });
    }
};
exports.updateMessage = updateMessage;
// Eliminar un mensaje
const deleteMessage = async (req, res) => {
    try {
        const message = await Message_1.default.findByIdAndDelete(req.params.id);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Mensaje no encontrado',
            });
        }
        res.json({
            success: true,
            message: 'Mensaje eliminado',
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al eliminar mensaje',
            error: error.message,
        });
    }
};
exports.deleteMessage = deleteMessage;
// Agregar reacción a un mensaje
const addReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji, userId } = req.body;
        const message = await Message_1.default.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Mensaje no encontrado',
            });
        }
        // Buscar si ya existe esa reacción
        const existingReaction = message.reactions.find((r) => r.emoji === emoji);
        if (existingReaction) {
            // Si el usuario ya reaccionó, quitar su reacción
            if (existingReaction.users.includes(userId)) {
                existingReaction.users = existingReaction.users.filter((id) => id.toString() !== userId);
                // Si no quedan usuarios, eliminar la reacción
                if (existingReaction.users.length === 0) {
                    message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
                }
            }
            else {
                // Agregar usuario a la reacción existente
                existingReaction.users.push(userId);
            }
        }
        else {
            // Crear nueva reacción
            message.reactions.push({ emoji, users: [userId] });
        }
        await message.save();
        const updatedMessage = await Message_1.default.findById(messageId)
            .populate('sender', 'username email avatar status');
        res.json({
            success: true,
            message: 'Reacción actualizada',
            data: updatedMessage,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al agregar reacción',
            error: error.message,
        });
    }
};
exports.addReaction = addReaction;
