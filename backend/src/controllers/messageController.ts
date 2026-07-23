import { Response } from 'express';
import Message from '../models/Message';
import Channel from '../models/Channel';
import aiService from '../services/aiService';
import { AuthRequest } from '../middleware/auth';

// Obtener mensajes de un canal — solo si el usuario autenticado es miembro
export const getMessagesByChannel = async (req: AuthRequest, res: Response) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const channel = await Channel.findOne({ _id: channelId, members: req.userId });
    if (!channel) {
      return res.status(404).json({ success: false, message: 'Canal no encontrado' });
    }

    const messages = await Message.find({ channel: channelId, threadParent: null })
      .populate('sender', 'username email avatar status')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await Message.countDocuments({ channel: channelId, threadParent: null });

    res.json({
      success: true,
      count: messages.length,
      total,
      data: messages.reverse(), // Ordenar de mas antiguo a mas reciente
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
export const createMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { content, channel, type = 'text', attachments = [], pollData = null, threadData = null } = req.body;

    if (!req.userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const DEFAULT_POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    if (pollData && pollData.options) {
      for (let i = 0; i < pollData.options.length; i++) {
        if (!pollData.options[i].emoji || !pollData.options[i].emoji.trim()) {
          pollData.options[i].emoji = DEFAULT_POLL_EMOJIS[i] || `⃣${i + 1}`;
        }
      }
    }

    // ← el canal debe existir Y el usuario autenticado debe ser miembro
    const channelExists = await Channel.findOne({ _id: channel, members: req.userId });
    if (!channelExists) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    const message = await Message.create({
      content,
      channel,
      sender: req.userId,
      type,
      attachments: Array.isArray(attachments) ? attachments : [],
      pollData: pollData || undefined,
      threadData: threadData || undefined,
    });

    const populatedMessage: any = await Message.findById(message._id)
      .populate('sender', 'username email avatar status');

    // ← respondemos YA, antes de tocar Slack/Discord/WhatsApp/IA — elimina la condicion de carrera
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
            if (pollData) {
              const slackResult = await slackService.sendPollMessage(channelExists.name, pollData, senderUsername);
              if (slackResult) {
                await Message.findByIdAndUpdate(message._id, { slackMessageTs: slackResult });
              }
            } else {
              await slackService.sendMessage(channelExists.name, content, senderUsername, attachments);
            }
            console.log('✅ Mensaje sincronizado con Slack');
          }
        }
      } catch (slackError: any) {
        console.error('⚠️ Error enviando a Slack:', slackError.message);
      }

      // 🎮 INTEGRACIÓN DISCORD
      try {
        if (channelExists.discordChannelId) {
          const discordservice = require('../services/discordservice').default;
          if (discordservice.isConfigured()) {
            if (pollData || threadData) {
              console.log(`[DEBUG] sendStructuredMessage llamado para ${pollData ? 'POLL' : 'THREAD'}`);
              const discordMsgId = await discordservice.sendStructuredMessage(
                String(channelExists._id),
                senderUsername,
                senderAvatar,
                pollData || null,
                threadData || null,
              );
              console.log(`[DEBUG] sendStructuredMessage retornó: ${discordMsgId}`);
              if (discordMsgId) {
                if (threadData) {
                  await Message.findByIdAndUpdate(message._id, { discordThreadId: discordMsgId });
                  console.log(`[DEBUG] Guardado discordThreadId: ${discordMsgId}`);
                }
                if (pollData) {
                  await Message.findByIdAndUpdate(message._id, { discordMessageId: discordMsgId });
                  console.log(`[DEBUG] Guardado discordMessageId: ${discordMsgId}`);
                }
              } else {
                console.warn(`[DEBUG] sendStructuredMessage retornó null/undefined`);
              }
            } else {
              await discordservice.sendMessage(String(channelExists._id), content, senderUsername, senderAvatar, attachments);
            }
            console.log('✅ Mensaje sincronizado con Discord');
          }
        }
      } catch (discordError: any) {
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
      } catch (whatsappError: any) {
        console.error('⚠️ Error enviando a WhatsApp:', whatsappError.message);
      }

      // 🤖 INTEGRACIÓN IA
      try {
        const io = req.app.get('io');
        await aiService.checkAndRespond({
          text: content,
          channel: channelExists,
          io,
          senderId: req.userId,
        });
      } catch (aiError: any) {
        console.error('⚠️ Error disparando integracion de IA:', aiError.message);
      }
    })();

  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al crear mensaje',
      error: error.message,
    });
  }
};

// Editar un mensaje — solo el autor puede editar su propio mensaje
export const updateMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const existing = await Message.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
    }
    if (existing.sender.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'No podes editar un mensaje de otro usuario' });
    }

    existing.content = content;
    existing.isEdited = true;
    await existing.save();

    const populated = await Message.findById(id).populate('sender', 'username email avatar status');

    res.json({
      success: true,
      message: 'Mensaje actualizado',
      data: populated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar mensaje',
      error: error.message,
    });
  }
};

// Eliminar un mensaje — solo el autor puede eliminar su propio mensaje
export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const existing = await Message.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
    }
    if (existing.sender.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'No podes eliminar un mensaje de otro usuario' });
    }

    await Message.findByIdAndDelete(req.params.id);

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

// Agregar/quitar reaccion a un mensaje
export const addReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Mensaje no encontrado',
      });
    }

    // Buscar si ya existe esa reaccion
    const existingReaction = message.reactions.find((r) => r.emoji === emoji);

    if (existingReaction) {
      const alreadyReacted = existingReaction.users.some((u) => u.toString() === userId);
      if (alreadyReacted) {
        // Ya habia reaccionado: quitar su reaccion
        existingReaction.users = existingReaction.users.filter(
          (id) => id.toString() !== userId
        );
        if (existingReaction.users.length === 0) {
          message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
        }
      } else {
        existingReaction.users.push(userId as any);
      }
    } else {
      message.reactions.push({ emoji, users: [userId as any] });
    }

    await message.save();

    const updatedMessage = await Message.findById(messageId)
      .populate('sender', 'username email avatar status');

    // Sync reaction to Discord
    if ((message as any).discordMessageId && message.channel) {
      try {
        const discordservice = require('../services/discordservice').default;
        if (discordservice.isConfigured()) {
          await discordservice.addReactionToMessage(
            String(message.channel),
            (message as any).discordMessageId,
            emoji,
          );
        }
      } catch (discordErr: any) {
        console.error('⚠️ Error sincronizando reacción a Discord:', discordErr.message);
      }
    }

    // Emit socket for real-time update
    const io = req.app.get('io');
    if (io && updatedMessage) {
      io.to(String(message.channel)).emit('message-reaction', {
        messageId: updatedMessage._id,
        reactions: (updatedMessage as any).reactions,
      });
    }

    res.json({
      success: true,
      message: 'Reaccion actualizada',
      data: updatedMessage,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al agregar reaccion',
      error: error.message,
    });
  }
};

// Votar en una encuesta
export const votePoll = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Mensaje no encontrado' });
    }

    if (message.type !== 'poll' || !message.pollData) {
      return res.status(400).json({ success: false, message: 'Este mensaje no es una encuesta' });
    }

    if (message.pollData.expiresAt && new Date() > message.pollData.expiresAt) {
      return res.status(400).json({ success: false, message: 'Esta encuesta ya expiro' });
    }

    if (optionIndex < 0 || optionIndex >= message.pollData.options.length) {
      return res.status(400).json({ success: false, message: 'Opcion invalida' });
    }

    const pollData = message.pollData as any;

    // Track the old voted option index before changing (for single-choice)
    let previousOptionIndex = -1;
    if (!pollData.allowMultiple) {
      previousOptionIndex = pollData.options.findIndex((opt: any) =>
        opt.voters.some((v: any) => v.toString() === userId)
      );
    }

    if (pollData.allowMultiple) {
      const option = pollData.options[optionIndex];
      const alreadyVoted = option.voters.some((v: any) => v.toString() === userId);
      if (alreadyVoted) {
        option.voters = option.voters.filter((v: any) => v.toString() !== userId);
      } else {
        option.voters.push(userId);
      }
    } else {
      for (const opt of pollData.options) {
        const idx = opt.voters.findIndex((v: any) => v.toString() === userId);
        if (idx !== -1) {
          opt.voters.splice(idx, 1);
        }
      }
      pollData.options[optionIndex].voters.push(userId);
    }

    message.markModified('pollData');
    await message.save();

    // Sync vote to Discord: add new reaction, remove old reaction if changing option
    if ((message as any).discordMessageId && message.channel) {
      try {
        const discordservice = require('../services/discordservice').default;
        if (discordservice.isConfigured()) {
          const discordMsgId = (message as any).discordMessageId;
          const channelStr = String(message.channel);

          if (!pollData.allowMultiple && previousOptionIndex !== -1 && previousOptionIndex !== optionIndex) {
            const oldOption = pollData.options[previousOptionIndex];
            const oldEmoji = (oldOption.emoji || '').trim();
            if (oldEmoji) {
              await discordservice.removeReactionFromMessage(channelStr, discordMsgId, oldEmoji);
            }
          }

          const newOption = pollData.options[optionIndex];
          const newEmoji = (newOption.emoji || '').trim();
          if (newEmoji) {
            await discordservice.addReactionToMessage(channelStr, discordMsgId, newEmoji);
          }
        }
      } catch (discordErr: any) {
        console.error('⚠️ Error sincronizando voto a Discord:', discordErr.message);
      }
    }

    // Sync vote to Slack: add number emoji reaction, remove old if changing option
    const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    if ((message as any).slackMessageTs && message.channel) {
      try {
        const slackService = require('../services/slackService').default;
        if (slackService.isConfigured()) {
          const slackTs = (message as any).slackMessageTs;
          const channelObj = await Channel.findById(message.channel);
          if (channelObj?.slackChannelId) {
            if (!pollData.allowMultiple && previousOptionIndex !== -1 && previousOptionIndex !== optionIndex) {
              const oldEmoji = NUM_EMOJIS[previousOptionIndex];
              if (oldEmoji) {
                await slackService.removeReactionFromSlackMessage(channelObj.slackChannelId, slackTs, oldEmoji);
              }
            }
            const newEmoji = NUM_EMOJIS[optionIndex];
            if (newEmoji) {
              await slackService.addReactionToSlackMessage(channelObj.slackChannelId, slackTs, newEmoji);
            }
          }
        }
      } catch (slackErr: any) {
        console.error('⚠️ Error sincronizando voto a Slack:', slackErr.message);
      }
    }

    const populated = await Message.findById(messageId)
      .populate('sender', 'username email avatar status');

    const io = req.app.get('io');
    if (io && populated) {
      io.to(String(message.channel)).emit('poll-voted', {
        messageId: populated._id,
        pollData: (populated as any).pollData,
      });
    }

    res.json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al votar',
      error: error.message,
    });
  }
};

// POST /api/messages/:messageId/reply — crear respuesta a un hilo
export const replyToThread = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content, attachments = [] } = req.body;

    if (!req.userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    const parentMessage = await Message.findById(messageId);
    if (!parentMessage) {
      return res.status(404).json({ success: false, message: 'Mensaje padre no encontrado' });
    }

    if (parentMessage.type !== 'thread') {
      return res.status(400).json({ success: false, message: 'El mensaje padre no es un hilo' });
    }

    const reply = await Message.create({
      content,
      channel: parentMessage.channel,
      sender: req.userId,
      type: 'text',
      attachments: Array.isArray(attachments) ? attachments : [],
      threadParent: parentMessage._id,
    });

    // Actualizar replyCount y agregar participante al padre
    const threadData = (parentMessage.threadData as any) || {};
    threadData.replyCount = (threadData.replyCount || 0) + 1;
    if (!threadData.participants) threadData.participants = [];
    if (!threadData.participants.includes(req.userId)) {
      threadData.participants.push(req.userId);
    }
    parentMessage.threadData = threadData;
    await parentMessage.save();

    const populated = await Message.findById(reply._id)
      .populate('sender', 'username email avatar status');

    // Enviar respuesta al thread de Discord si existe
    (async () => {
      try {
        const channelDoc = await Channel.findById(parentMessage.channel);
        if (channelDoc?.discordChannelId) {
          const discordservice = require('../services/discordservice').default;
          if (discordservice.isConfigured() && parentMessage.discordThreadId) {
            const senderUser = populated?.sender as any;
            await discordservice.sendReplyToThread(
              String(channelDoc._id),
              parentMessage.discordThreadId,
              content,
              senderUser?.username || 'Usuario',
              senderUser?.avatar || undefined,
              attachments,
            );
          }
        }
      } catch (err: any) {
        console.error('[Reply] Error enviando respuesta a Discord:', err.message);
      }

      // Emitir socket event para respuestas en tiempo real
      try {
        const io = req.app.get('io');
        if (io) {
          io.to(`channel:${parentMessage.channel}`).emit('thread:reply', {
            parentMessageId: parentMessage._id,
            reply: populated,
          });
        }
      } catch (_) {}
    })();

    res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al responder',
      error: error.message,
    });
  }
};

// GET /api/messages/thread/:messageId/replies — obtener respuestas de un hilo
export const getThreadReplies = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const parentMessage = await Message.findById(messageId);
    if (!parentMessage) {
      return res.status(404).json({ success: false, message: 'Hilo no encontrado' });
    }

    const replies = await Message.find({ threadParent: messageId })
      .populate('sender', 'username email avatar status')
      .sort({ createdAt: 1 })
      .limit(Number(limit))
      .skip(Number(skip));

    const total = await Message.countDocuments({ threadParent: messageId });

    res.json({
      success: true,
      count: replies.length,
      total,
      data: replies,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener respuestas',
      error: error.message,
    });
  }
};