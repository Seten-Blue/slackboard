import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Message from '../models/Message';
import User from '../models/User';
import Channel from '../models/Channel';
import geminiService, { QuotaExceededError } from './geminiService';
import slackService from './slackService';
import { recordMetric } from '../controllers/aiMetricsController';

const AI_EMAIL = 'ai@slackboard.com';
const AI_USERNAME = 'Zork';
const AI_CHANNEL_PREFIX = 'Zork';
const HISTORY_LIMIT = 12;

const SLASH_REGEX = /^\/zork\s+([\s\S]+)/i;
const MENTION_REGEX = /@zork\b/i;

const SWITCH_LINES = [
  'Se me acabaron los pensamientos de ese modelo, así que salté a otro nivel de la cabeza.',
  'Cambié de canal mental por un rato, ahora corro con otro cerebro.',
  'Se agotó ese modo de pensar por hoy, probando un nivel distinto.',
  'Reacomodé mis circuitos y salté a otro modelo para seguir charlando.',
];

let cachedAIUserId: string | null = null;

async function getOrCreateAIUser(): Promise<string> {
  if (cachedAIUserId) {
    return cachedAIUserId;
  }

  let aiUser = await User.findOne({ email: AI_EMAIL });

  if (!aiUser) {
    aiUser = await User.create({
      email: AI_EMAIL,
      username: AI_USERNAME,
      password: 'ai_' + Math.random().toString(36).slice(2),
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Zork',
      status: 'online',
    });
    console.log('🤖 Usuario "Zork" creado en la base de datos');
  } else if (aiUser.username !== AI_USERNAME) {
    aiUser.username = AI_USERNAME;
    await aiUser.save();
    console.log('🤖 Usuario de IA renombrado a "Zork"');
  }

  cachedAIUserId = (aiUser._id as mongoose.Types.ObjectId).toString();
  return cachedAIUserId;
}

export async function ensureAIChannel(userId?: string) {
  const aiUserId = await getOrCreateAIUser();
  const channelName = userId ? `${AI_CHANNEL_PREFIX} - ${userId}` : AI_CHANNEL_PREFIX;

  try {
    const channel = await Channel.findOneAndUpdate(
      { name: channelName },
      {
        $setOnInsert: {
          name: channelName,
          description: 'Zork, tu asistente personal con superpoderes conversacionales',
          isPrivate: !!userId,
          createdBy: aiUserId,
          members: userId ? [aiUserId, userId] : [aiUserId],
          isAIChannel: true,
          platform: 'other',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return channel;
  } catch (error: any) {
    if (error.code === 11000) {
      const existing = await Channel.findOne({ name: channelName });
      if (existing) return existing;
    }
    throw error;
  }
}

function extractQuestion(text: string): string | null {
  const slashMatch = text.match(SLASH_REGEX);
  if (slashMatch) return slashMatch[1].trim();
  if (MENTION_REGEX.test(text)) return text.replace(MENTION_REGEX, '').trim();
  return null;
}

function looksLikeAIQuestion(text: string): boolean {
  return SLASH_REGEX.test(text) || MENTION_REGEX.test(text);
}

async function buildHistory(channelId: string, aiUserId: string, isDedicatedChannel: boolean) {
  const recentMessages = await Message.find({ channel: channelId })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT * 4)
    .lean();

  const relevant = recentMessages.filter((m: any) => {
    const isFromAI = m.sender?.toString() === aiUserId;
    if (isFromAI) return true;
    if (isDedicatedChannel) return true;
    return looksLikeAIQuestion(m.content);
  });

  return relevant
    .slice(0, HISTORY_LIMIT)
    .reverse()
    .map((m: any) => {
      const isFromAI = m.sender?.toString() === aiUserId;
      if (isFromAI) return { role: 'model' as const, text: m.content as string };
      const stripped = extractQuestion(m.content);
      return { role: 'user' as const, text: (stripped ?? m.content) as string };
    });
}

interface CheckParams {
  text: string;
  channel: any;
  io?: Server;
  senderId?: string;
}

async function emitAIMessage(content: string, channel: any, aiUserId: string, io?: Server) {
  const message = await Message.create({
    content,
    channel: channel._id,
    sender: aiUserId,
    type: 'text',
  });

  const populated = await Message.findById(message._id)
    .populate('sender', 'username email avatar status');

  if (io && populated) {
    io.to(channel._id.toString()).emit('new-message', {
      channelId: channel._id.toString(),
      message: populated,
    });
  }

  return populated;
}

export async function checkAndRespond({ text, channel, io, senderId }: CheckParams): Promise<void> {
  if (!geminiService.isConfigured()) return;
  if (channel.aiEnabled === false) return;

  const aiUserId = await getOrCreateAIUser();
  if (senderId && senderId === aiUserId) return;

  const isDedicatedChannel = channel.isAIChannel === true;
  let finalQuestion: string;

  if (isDedicatedChannel) {
    const stripped = extractQuestion(text);
    finalQuestion = (stripped && stripped.length > 0) ? stripped : text.trim();
    if (!finalQuestion) return;
  } else {
    const rawQuestion = extractQuestion(text);
    if (rawQuestion === null) return;
    finalQuestion = rawQuestion.length > 0 ? rawQuestion : '¿En qué puedo ayudarte?';
  }

  try {
    const startTime = Date.now();
    const history = await buildHistory(channel._id.toString(), aiUserId, isDedicatedChannel);
    const { text: replyText, switchedTo } = await geminiService.generateReply(finalQuestion, history);
    const responseTimeMs = Date.now() - startTime;

    if (switchedTo) {
      const line = SWITCH_LINES[Math.floor(Math.random() * SWITCH_LINES.length)];
      await emitAIMessage(`${line} Ahora estoy pensando con ${switchedTo}.`, channel, aiUserId, io);
    }

    await emitAIMessage(replyText, channel, aiUserId, io);
    console.log('🤖 Respuesta de Zork guardada y emitida');

    recordMetric({
      user: senderId || aiUserId,
      channel: channel._id.toString(),
      modelName: switchedTo || 'gemini-default',
      inputTokens: finalQuestion.length,
      outputTokens: replyText.length,
      totalTokens: finalQuestion.length + replyText.length,
      responseTimeMs,
      query: finalQuestion.substring(0, 200),
      responsePreview: replyText.substring(0, 200),
      success: true,
    }).catch(() => {});

    if (channel.slackChannelId && slackService.isConfigured()) {
      try {
        await slackService.sendMessageToChannel(channel, replyText, AI_USERNAME);
      } catch (slackError: any) {
        console.error('⚠️  No se pudo enviar la respuesta de Zork a Slack:', slackError.message);
      }
    }
  } catch (error: any) {
    console.error('❌ Error en la integracion de IA:', error.message);

    const isQuotaError = error instanceof QuotaExceededError;
    const friendlyMessage = isQuotaError
      ? 'Uy, hoy ya utilicé todas mis consultas gratuitas en todos los modelos disponibles. Prueba de nuevo más tarde, o si eres Juan, ya sabes qué hacer con la facturación 😅'
      : 'Uy, algo se me trabó por un segundo. Prueba de nuevo en un rato.';

    recordMetric({
      user: senderId || aiUserId,
      channel: channel._id.toString(),
      modelName: 'gemini-default',
      query: finalQuestion.substring(0, 200),
      responsePreview: friendlyMessage.substring(0, 200),
      success: false,
      errorMessage: error.message,
    }).catch(() => {});

    try {
      await emitAIMessage(friendlyMessage, channel, aiUserId, io);
    } catch {
      // no-op
    }
  }
}

export default { checkAndRespond, ensureAIChannel };