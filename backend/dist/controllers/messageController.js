"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addReaction = exports.deleteMessage = exports.updateMessage = exports.createMessage = exports.getMessagesByChannel = void 0;
const Message_1 = __importDefault(require("../models/Message"));
const Channel_1 = __importDefault(require("../models/Channel"));
const aiService_1 = __importDefault(require("../services/aiService"));
// Obtener mensajes de un canal — solo si el usuario autenticado es miembro
const getMessagesByChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const { limit = 50, skip = 0 } = req.query;
        const channel = await Channel_1.default.findOne({ _id: channelId, members: req.userId });
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Canal no encontrado' });
        }
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
        const { content, channel, type = 'text' } = req.body;
        if (!req.userId) {
            return res.status(401).json({ success: false, message: 'No autenticado' });
        }
        // ← el canal debe existir Y el usuario autenticado debe ser miembro
        const channelExists = await Channel_1.default.findOne({ _id: channel, members: req.userId });
        if (!channelExists) {
            return res.status(404).json({
                success: false,
                message: 'Canal no encontrado',
            });
        }
        const message = await Message_1.default.create({
            content,
            channel,
            sender: req.userId, // ← SIEMPRE el usuario autenticado (JWT), nunca lo que mande el body
            type,
        });
        const populatedMessage = await Message_1.default.findById(message._id)
            .populate('sender', 'username email avatar status');
        // ← respondemos YA, antes de tocar Slack/Discord/WhatsApp/IA — elimina la condición de carrera
        res.status(201).json({
            success: true,
            message: 'Mensaje enviado',
            data: populatedMessage,
        });
        const senderUsername = populatedMessage?.sender?.username || 'Usuario de SlackBoard';
        const senderAvatar = populatedMessage?.sender?.avatar || undefined;
        // Todo lo que sigue corre en segundo plano, sin bloquear la respuesta
        (async () => {
            // 🔥 INTEGRACIÓN SLACK
            try {
                if (channelExists.slackChannelId) {
                    const slackService = require('../services/slackService').default;
                    if (slackService.isConfigured()) {
                        await slackService.sendMessage(channelExists.name, content, senderUsername);
                        console.log('✅ Mensaje sincronizado con Slack');
                    }
                }
            }
            catch (slackError) {
                console.error('⚠️ Error enviando a Slack:', slackError.message);
            }
            // 🎮 INTEGRACIÓN DISCORD
            try {
                if (channelExists.discordChannelId) {
                    const discordservice = require('../services/discordservice').default;
                    if (discordservice.isConfigured()) {
                        await discordservice.sendMessage(String(channelExists._id), content, senderUsername, senderAvatar);
                        console.log('✅ Mensaje sincronizado con Discord');
                    }
                }
            }
            catch (discordError) {
                console.error('⚠️ Error enviando a Discord:', discordError.message);
            }
            // 📱 INTEGRACIÓN WHATSAPP
            try {
                if (channelExists.whatsappPhone) {
                    const whatsappService = require('../services/whatsappService').default;
                    if (whatsappService.isConfigured()) {
                        await whatsappService.sendTextMessage(channelExists.whatsappPhone, content);
                        console.log('✅ Mensaje sincronizado con WhatsApp');
                    }
                }
            }
            catch (whatsappError) {
                console.error('⚠️ Error enviando a WhatsApp:', whatsappError.message);
            }
            // 🤖 INTEGRACIÓN IA
            try {
                const io = req.app.get('io');
                await aiService_1.default.checkAndRespond({
                    text: content,
                    channel: channelExists,
                    io,
                    senderId: req.userId,
                });
            }
            catch (aiError) {
                console.error('⚠️ Error disparando integración de IA:', aiError.message);
            }
        })();
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
// Editar un mensaje — solo el autor puede editar su propio mensaje
const updateMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const existing = await Message_1.default.findById(id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
        }
        if (existing.sender.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'No podés editar un mensaje de otro usuario' });
        }
        existing.content = content;
        existing.isEdited = true;
        await existing.save();
        const populated = await Message_1.default.findById(id).populate('sender', 'username email avatar status');
        res.json({
            success: true,
            message: 'Mensaje actualizado',
            data: populated,
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
// Eliminar un mensaje — solo el autor puede eliminar su propio mensaje
const deleteMessage = async (req, res) => {
    try {
        const existing = await Message_1.default.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
        }
        if (existing.sender.toString() !== req.userId) {
            return res.status(403).json({ success: false, message: 'No podés eliminar un mensaje de otro usuario' });
        }
        await Message_1.default.findByIdAndDelete(req.params.id);
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
// Agregar/quitar reacción a un mensaje
const addReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.userId;
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
            const alreadyReacted = existingReaction.users.some((u) => u.toString() === userId);
            if (alreadyReacted) {
                // Ya había reaccionado: quitar su reacción
                existingReaction.users = existingReaction.users.filter((id) => id.toString() !== userId);
                if (existingReaction.users.length === 0) {
                    message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
                }
            }
            else {
                existingReaction.users.push(userId);
            }
        }
        else {
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
