import { Request, Response } from 'express';
import Channel from '../models/Channel';
import User from '../models/User';

// Obtener todos los canales
export const getAllChannels = async (req: Request, res: Response) => {
  try {
    const channels = await Channel.find()
      .populate('createdBy', 'username email avatar')
      .populate('members', 'username email avatar status')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: channels.length,
      data: channels,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener canales',
      error: error.message,
    });
  }
};

// Obtener un canal por ID
export const getChannelById = async (req: Request, res: Response) => {
  try {
    const channel = await Channel.findById(req.params.id)
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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener el canal',
      error: error.message,
    });
  }
};

// Crear un nuevo canal
export const createChannel = async (req: Request, res: Response) => {
  try {
    const { name, description, isPrivate, createdBy } = req.body;

    // Verificar si el usuario existe
    const user = await User.findById(createdBy);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    const channel = await Channel.create({
      name,
      description,
      isPrivate: isPrivate || false,
      createdBy,
      members: [createdBy], // El creador es miembro automáticamente
    });

    const populatedChannel = await Channel.findById(channel._id)
      .populate('createdBy', 'username email avatar')
      .populate('members', 'username email avatar status');

    res.status(201).json({
      success: true,
      message: 'Canal creado exitosamente',
      data: populatedChannel,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al crear el canal',
      error: error.message,
    });
  }
};

// Agregar miembro a un canal
export const addMemberToChannel = async (req: Request, res: Response) => {
  try {
    const { channelId, userId } = req.body;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    const user = await User.findById(userId);
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

    const updatedChannel = await Channel.findById(channelId)
      .populate('createdBy', 'username email avatar')
      .populate('members', 'username email avatar status');

    res.json({
      success: true,
      message: 'Miembro agregado exitosamente',
      data: updatedChannel,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al agregar miembro',
      error: error.message,
    });
  }
};

// Eliminar canal
export const deleteChannel = async (req: Request, res: Response) => {
  try {
    const channel = await Channel.findByIdAndDelete(req.params.id);

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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el canal',
      error: error.message,
    });
  }
};