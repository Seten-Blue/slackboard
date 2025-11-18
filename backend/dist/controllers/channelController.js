"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChannel = exports.addMemberToChannel = exports.createChannel = exports.getChannelById = exports.getAllChannels = void 0;
const Channel_1 = __importDefault(require("../models/Channel"));
const User_1 = __importDefault(require("../models/User"));
// Obtener todos los canales
const getAllChannels = async (req, res) => {
    try {
        const channels = await Channel_1.default.find()
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
// Obtener un canal por ID
const getChannelById = async (req, res) => {
    try {
        const channel = await Channel_1.default.findById(req.params.id)
            .populate('createdBy', 'username email avatar')
            .populate('members', 'username email avatar status');
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'Canal no encontrado',
            });
        }
        res.json({
            success: true,
            data: channel,
        });
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
// Crear un nuevo canal
const createChannel = async (req, res) => {
    try {
        const { name, description, isPrivate, createdBy } = req.body;
        // Verificar si el usuario existe
        const user = await User_1.default.findById(createdBy);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado',
            });
        }
        const channel = await Channel_1.default.create({
            name,
            description,
            isPrivate: isPrivate || false,
            createdBy,
            members: [createdBy], // El creador es miembro automáticamente
        });
        const populatedChannel = await Channel_1.default.findById(channel._id)
            .populate('createdBy', 'username email avatar')
            .populate('members', 'username email avatar status');
        res.status(201).json({
            success: true,
            message: 'Canal creado exitosamente',
            data: populatedChannel,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al crear el canal',
            error: error.message,
        });
    }
};
exports.createChannel = createChannel;
// Agregar miembro a un canal
const addMemberToChannel = async (req, res) => {
    try {
        const { channelId, userId } = req.body;
        const channel = await Channel_1.default.findById(channelId);
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'Canal no encontrado',
            });
        }
        const user = await User_1.default.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuario no encontrado',
            });
        }
        // Verificar si ya es miembro
        if (channel.members.includes(userId)) {
            return res.status(400).json({
                success: false,
                message: 'El usuario ya es miembro del canal',
            });
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
// Eliminar canal
const deleteChannel = async (req, res) => {
    try {
        const channel = await Channel_1.default.findByIdAndDelete(req.params.id);
        if (!channel) {
            return res.status(404).json({
                success: false,
                message: 'Canal no encontrado',
            });
        }
        res.json({
            success: true,
            message: 'Canal eliminado exitosamente',
        });
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
//# sourceMappingURL=channelController.js.map