import { Request, Response } from 'express';
import Message from '../models/Message';
import Channel from '../models/Channel';
import User from '../models/User';
import slackService from '../services/slackService';

// Obtener mensajes de un canal
export const getMessagesByChannel = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const messages = await Message.find({ channel: channelId })
      .populate('sender', 'username email avatar status')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await Message.countDocuments({ channel: channelId });

    res.json({
      success: true,
      count: messages.length,
      total,
      data: messages.reverse(),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener mensajes',
      error: error.message,
    });
  }
};

// Crear un nuevo mensaje
export const createMessage = async (req: Request, res: Response) => {
  try {
    const { content, channel, sender, type = 'text' } = req.body;

    console.log('📥 Recibiendo mensaje:', { content, channel, sender, type });

    const channelExists = await Channel.findById(channel);
    if (!channelExists) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    const userExists = await User.findById(sender);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    const message = await Message.create({
      content,
      channel,
      sender,
      type,
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username email avatar status');

    console.log('✅ Mensaje creado en MongoDB:', populatedMessage);

    // EMITIR POR SOCKET.IO (ANTES de Slack)
    const io = (req as any).app.get('io');
    if (io && populatedMessage) {
      console.log('📤 Socket.IO emitiendo mensaje a canal:', channel);
      io.to(channel.toString()).emit('newMessage', populatedMessage);
    }

    // 🔥 INTEGRACIÓN SLACK (con manejo silencioso de errores)
    try {
      if (slackService.isConfigured()) {
        await slackService.sendMessage(
          channelExists.name,
          content,
          userExists.username
        );
      }
    } catch (slackError: any) {
      if (slackError.data?.error !== 'invalid_auth' && slackError.data?.error !== 'account_inactive') {
        console.error('⚠️ Error con Slack:', slackError.message);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Mensaje enviado',
      data: populatedMessage,
    });
  } catch (error: any) {
    console.error('❌ Error al crear mensaje:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear mensaje',
      error: error.message,
    });
  }
};

// Editar un mensaje
export const updateMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const message = await Message.findByIdAndUpdate(
      id,
      { content, isEdited: true },
      { new: true }
    ).populate('sender', 'username email avatar status');

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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar mensaje',
      error: error.message,
    });
  }
};

// Eliminar un mensaje
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const message = await Message.findByIdAndDelete(req.params.id);

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
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar mensaje',
      error: error.message,
    });
  }
};

// Agregar reacción a un mensaje
export const addReaction = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji, userId } = req.body;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado',
      });
    }

    const existingReaction = message.reactions.find((r) => r.emoji === emoji);

    if (existingReaction) {
      if (existingReaction.users.includes(userId)) {
        existingReaction.users = existingReaction.users.filter(
          (id) => id.toString() !== userId
        );
        if (existingReaction.users.length === 0) {
          message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
        }
      } else {
        existingReaction.users.push(userId);
      }
    } else {
      message.reactions.push({ emoji, users: [userId] });
    }

    await message.save();

    const updatedMessage = await Message.findById(messageId)
      .populate('sender', 'username email avatar status');

    res.json({
      success: true,
      message: 'Reacción actualizada',
      data: updatedMessage,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al agregar reacción',
      error: error.message,
    });
  }
};