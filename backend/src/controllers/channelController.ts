import { Response } from 'express';
import Channel from '../models/Channel';
import User from '../models/User';
import slackService from '../services/slackService';
import { AuthRequest } from '../middleware/auth';

// Obtener SOLO los canales de los que el usuario autenticado es miembro
export const getAllChannels = async (req: AuthRequest, res: Response) => {
  try {
    const channels = await Channel.find({ members: req.userId })
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

// Obtener un canal por ID (solo si el usuario es miembro)
export const getChannelById = async (req: AuthRequest, res: Response) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('createdBy', 'username email avatar')
      .populate('members', 'username email avatar status');

    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const isMember = channel.members.some((m: any) => m._id.toString() === req.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
    }

    res.json({ success: true, data: channel });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener el canal',
      error: error.message,
    });
  }
};

// Crear un nuevo canal — el creador es siempre el usuario autenticado (JWT), nunca lo que mande el body
export const createChannel = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, isPrivate } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    const channel = await Channel.create({
      name,
      description,
      isPrivate: isPrivate || false,
      createdBy: req.userId,
      members: [req.userId],
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

// Editar nombre de un canal (solo si el usuario es miembro)
export const updateChannel = async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = req.body;

    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const isMember = channel.members.some((m: any) => m.toString() === req.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
    }

    const nameChanged = name && name !== channel.name;
    channel.description = description ?? channel.description;

    let slackWarning: string | null = null;

    if (nameChanged && channel.slackChannelId) {
      try {
        await slackService.renameChannel(channel.slackChannelId, name);
        channel.name = name;
      } catch (error: any) {
        console.error('❌ Error renombrando canal en Slack:', error.message);
        slackWarning = 'No se pudo renombrar el canal en Slack (el bot no tiene permiso para renombrar canales que no creo). El nombre no se cambio para mantener la sincronizacion.';
      }
    } else if (nameChanged) {
      channel.name = name;
    }

    await channel.save();

    res.json({
      success: true,
      message: slackWarning ? 'Canal actualizado (con advertencia)' : 'Canal actualizado exitosamente',
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

// Agregar miembro a un canal (solo si quien llama ya es miembro)
export const addMemberToChannel = async (req: AuthRequest, res: Response) => {
  try {
    const { channelId, userId } = req.body;

    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const callerIsMember = channel.members.some((m: any) => m.toString() === req.userId);
    if (!callerIsMember) {
      return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    if (channel.members.some((m: any) => m.toString() === userId)) {
      return res.status(400).json({ success: false, message: 'El usuario ya es miembro del canal' });
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
export const leaveChannel = async (req: AuthRequest, res: Response) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const isMember = channel.members.some((m: any) => m.toString() === req.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
    }

    if (!channel.slackChannelId) {
      return res.status(400).json({ success: false, message: 'Este canal no esta vinculado con Slack.' });
    }

    try {
      await slackService.leaveChannel(channel.slackChannelId);
    } catch (slackError: any) {
      console.error('Error abandonando el canal en Slack:', slackError.message);
    }

    res.json({
      success: true,
      message: 'El bot abandono el canal en la app (Slack pudo fallar, revisa logs).',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error abandonando el canal.',
      error: error.message,
    });
  }
};

// Eliminar canal (solo si el usuario es miembro)
export const deleteChannel = async (req: AuthRequest, res: Response) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const isMember = channel.members.some((m: any) => m.toString() === req.userId);
    if (!isMember) {
      return res.status(403).json({ success: false, message: 'No tenes acceso a este canal' });
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
    res.json({ success: true, message: 'Canal eliminado exitosamente' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el canal',
      error: error.message,
    });
  }
};