import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Channel from '../models/Channel';
import User from '../models/User';
import slackService from '../services/slackService';

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

    let creatorId = createdBy;
    const isValidCreatorId = creatorId && mongoose.Types.ObjectId.isValid(creatorId.toString());

    if (!isValidCreatorId) {
      const defaultUser = await User.findOne({ email: 'admin@slackboard.com' }) || await User.findOne();
      if (!defaultUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado',
        });
      }
      creatorId = defaultUser._id;
    }

    // Verificar si el usuario existe
    const user = await User.findById(creatorId);
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
      createdBy: creatorId,
      members: [creatorId], // El creador es miembro automáticamente
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

// Editar nombre de un canal
export const updateChannel = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    const channel = await Channel.findById(req.params.id);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    channel.name = name ?? channel.name;
    channel.description = description ?? channel.description;

    await channel.save();

    let slackWarning: string | null = null;

    if (channel.slackChannelId) {
      try {
        await slackService.renameChannel(channel.slackChannelId, channel.name);
      } catch (error: any) {
        console.error('❌ Error renombrando canal en Slack:', error.message);
        slackWarning = 'El canal se actualizó, pero no se pudo renombrar en Slack (revisa permisos del bot).';
      }
    }

    res.json({
      success: true,
      message: 'Canal actualizado exitosamente',
      data: channel,
      ...(slackWarning && { warning: slackWarning }),
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el canal',
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

// Hacer que el bot abandone un canal de Slack
export const leaveChannel = async (req: Request, res: Response) => {
  try {

    const channel = await Channel.findById(req.params.id);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    if (!channel.slackChannelId) {
      return res.status(400).json({
        success: false,
        message: 'Este canal no está vinculado con Slack.',
      });
    }

    try {
      await slackService.leaveChannel(channel.slackChannelId);
    } catch (slackError: any) {
      console.error('Error abandonando el canal en Slack:', slackError.message);
    }

    res.json({
      success: true,
      message: 'El bot abandonó el canal en la app (Slack pudo fallar, revisa logs).',
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error abandonando el canal.',
      error: error.message,
    });
  }
};

// Eliminar canal
export const deleteChannel = async (req: Request, res: Response) => {
  try {
    const channel = await Channel.findById(req.params.id);

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    
    if (channel.slackChannelId) {
      try {
        await slackService.leaveChannel(channel.slackChannelId);
      } catch (slackError: any) {
        console.error('❌ No se pudo abandonar el canal en Slack:', slackError.message);
        return res.status(502).json({
          success: false,
          message: `No se pudo abandonar el canal en Slack: ${slackError.message}`,
        });
      }
    }

    await Channel.findByIdAndDelete(req.params.id);

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