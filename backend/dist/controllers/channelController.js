"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChannel = exports.leaveChannel = exports.addMemberToChannel = exports.updateChannel = exports.createChannel = exports.getChannelById = exports.getAllChannels = void 0;
const Channel_1 = __importDefault(require("../models/Channel"));
const User_1 = __importDefault(require("../models/User"));
const slackService_1 = __importDefault(require("../services/slackService"));
const discordservice_1 = __importDefault(require("../services/discordservice"));
// Obtener SOLO los canales de los que el usuario autenticado es miembro
const getAllChannels = async (req, res) => {
    try {
        const channels = await Channel_1.default.find({ members: req.userId })
            .populate('createdBy', 'username email avatar')
            .populate('members', 'username email avatar status')
            .sort({ createdAt: -1 });
        res.json({
            success: true,
            count: channels.length,
            data: channels,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener canales',
            error: error.message,
        });
    }
};
exports.getAllChannels = getAllChannels;
// Obtener un canal por ID (solo si el usuario es miembro)
const getChannelById = async (req, res) => {
    try {
        const channel = await Channel_1.default.findById(req.params.id)
            .populate('createdBy', 'username email avatar')
            .populate('members', 'username email avatar status');
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Canal no encontrado' });
        }
        const isMember = channel.members.some((m) => m._id.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
        }
        res.json({ success: true, data: channel });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener el canal',
            error: error.message,
        });
    }
};
exports.getChannelById = getChannelById;
// Crear un nuevo canal -- el creador es siempre el usuario autenticado (JWT), nunca lo que mande el body
const createChannel = async (req, res) => {
    try {
        const { name, description, isPrivate, platform } = req.body;
        const user = await User_1.default.findById(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        const channelPlatform = platform || 'other';
        let slackChannelId;
        let discordChannelId;
        let displayName;
        let creationError = null;
        if (channelPlatform === 'slack') {
            try {
                const result = await slackService_1.default.createChannel(name, isPrivate || false);
                slackChannelId = result.channelId;
                displayName = `# ${result.name}`;
            }
            catch (err) {
                console.error('No se pudo crear el canal en Slack:', err.message);
                creationError = `Canal creado localmente pero no en Slack: ${err.message}`;
            }
        }
        else if (channelPlatform === 'discord') {
            try {
                const result = await discordservice_1.default.createChannel(name, isPrivate || false);
                discordChannelId = result.channelId;
                displayName = `# ${result.name}`;
            }
            catch (err) {
                console.error('No se pudo crear el canal en Discord:', err.message);
                creationError = `Canal creado localmente pero no en Discord: ${err.message}`;
            }
        }
        const channel = await Channel_1.default.create({
            name,
            description,
            isPrivate: isPrivate || false,
            platform: channelPlatform,
            createdBy: req.userId,
            members: [req.userId],
            ...(slackChannelId && { slackChannelId }),
            ...(discordChannelId && { discordChannelId }),
            ...(displayName && { displayName }),
        });
        const populatedChannel = await Channel_1.default.findById(channel._id)
            .populate('createdBy', 'username email avatar')
            .populate('members', 'username email avatar status');
        res.status(201).json({
            success: true,
            message: creationError || 'Canal creado exitosamente',
            data: populatedChannel,
            ...(creationError && { warning: creationError }),
        });
    }
    catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Ya existe un canal con ese nombre. Elige otro.',
            });
        }
        res.status(500).json({
            success: false,
            message: 'Error al crear el canal',
            error: error.message,
        });
    }
};
exports.createChannel = createChannel;
// Editar nombre de un canal (solo si el usuario es miembro)
const updateChannel = async (req, res) => {
    try {
        const { name, description } = req.body;
        const channel = await Channel_1.default.findById(req.params.id);
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Canal no encontrado' });
        }
        const isMember = channel.members.some((m) => m.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
        }
        const nameChanged = name && name !== channel.name;
        channel.description = description ?? channel.description;
        let slackWarning = null;
        if (nameChanged && channel.slackChannelId) {
            try {
                await slackService_1.default.renameChannel(channel.slackChannelId, name);
                channel.name = name;
            }
            catch (error) {
                console.error('❌ Error renombrando canal en Slack:', error.message);
                slackWarning = 'No se pudo renombrar el canal en Slack (el bot no tiene permiso para renombrar canales que no creo). El nombre no se cambio para mantener la sincronizacion.';
            }
        }
        else if (nameChanged) {
            channel.name = name;
        }
        await channel.save();
        res.json({
            success: true,
            message: slackWarning ? 'Canal actualizado (con advertencia)' : 'Canal actualizado exitosamente',
            data: channel,
            ...(slackWarning && { warning: slackWarning }),
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al actualizar el canal',
            error: error.message,
        });
    }
};
exports.updateChannel = updateChannel;
// Agregar miembro a un canal (solo si quien llama ya es miembro)
const addMemberToChannel = async (req, res) => {
    try {
        const { channelId, userId } = req.body;
        const channel = await Channel_1.default.findById(channelId);
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Canal no encontrado' });
        }
        const callerIsMember = channel.members.some((m) => m.toString() === req.userId);
        if (!callerIsMember) {
            return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
        }
        const user = await User_1.default.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }
        if (channel.members.some((m) => m.toString() === userId)) {
            return res.status(400).json({ success: false, message: 'El usuario ya es miembro del canal' });
        }
        channel.members.push(userId);
        await channel.save();
        const updatedChannel = await Channel_1.default.findById(channelId)
            .populate('createdBy', 'username email avatar')
            .populate('members', 'username email avatar status');
        res.json({
            success: true,
            message: 'Miembro agregado exitosamente',
            data: updatedChannel,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al agregar miembro',
            error: error.message,
        });
    }
};
exports.addMemberToChannel = addMemberToChannel;
// Hacer que el bot abandone un canal de Slack
const leaveChannel = async (req, res) => {
    try {
        const channel = await Channel_1.default.findById(req.params.id);
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Canal no encontrado' });
        }
        const isMember = channel.members.some((m) => m.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
        }
        if (!channel.slackChannelId) {
            return res.status(400).json({ success: false, message: 'Este canal no esta vinculado con Slack.' });
        }
        try {
            await slackService_1.default.leaveChannel(channel.slackChannelId);
        }
        catch (slackError) {
            console.error('Error abandonando el canal en Slack:', slackError.message);
        }
        res.json({
            success: true,
            message: 'El bot abandono el canal en la app (Slack pudo fallar, revisa logs).',
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error abandonando el canal.',
            error: error.message,
        });
    }
};
exports.leaveChannel = leaveChannel;
// Eliminar canal (solo si el usuario es miembro)
const deleteChannel = async (req, res) => {
    try {
        const channel = await Channel_1.default.findById(req.params.id);
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Canal no encontrado' });
        }
        const isMember = channel.members.some((m) => m.toString() === req.userId);
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
        }
        if (channel.slackChannelId) {
            try {
                await slackService_1.default.leaveChannel(channel.slackChannelId);
            }
            catch (slackError) {
                console.error('❌ No se pudo abandonar el canal en Slack:', slackError.message);
                return res.status(502).json({
                    success: false,
                    message: `No se pudo abandonar el canal en Slack: ${slackError.message}`,
                });
            }
        }
        await Channel_1.default.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Canal eliminado exitosamente' });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al eliminar el canal',
            error: error.message,
        });
    }
};
exports.deleteChannel = deleteChannel;
