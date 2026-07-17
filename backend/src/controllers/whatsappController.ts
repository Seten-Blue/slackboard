import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import whatsappService from '../services/whatsappService';
import Channel from '../models/Channel';
import Message from '../models/Message';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

// GET /api/whatsapp/webhook — verificación inicial que exige Meta al configurar
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === whatsappService.getVerifyToken()) {
    console.log('✅ Webhook de WhatsApp verificado');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

async function resolveOrCreateWhatsAppUser(phone: string, profileName?: string) {
  const email = `whatsapp_${phone}@whatsapp.local`;
  let user = await User.findOne({ email });
  if (user) return user;

  user = await User.create({
    email,
    username: profileName || phone,
    password: `whatsapp_${phone}`,
    status: 'online',
  });
  return user;
}

async function resolveOrCreateWhatsAppChannel(phone: string, profileName?: string) {
  let channel: any = await Channel.findOne({ whatsappPhone: phone });
  if (channel) return channel;

  const adminUser = (await User.findOne({ email: 'admin@slackboard.com' })) || (await User.findOne());
  if (!adminUser) throw new Error('No existe un usuario admin para crear el canal de WhatsApp');

  channel = await Channel.create({
    name: `whatsapp-${phone}`,
    displayName: profileName ? `${profileName} (WhatsApp)` : phone,
    description: 'Conversación de WhatsApp Business',
    isPrivate: true,
    platform: 'whatsapp',
    whatsappPhone: phone,
    members: [adminUser._id],
    createdBy: adminUser._id,
  });

  console.log(`➕ Canal nuevo creado desde WhatsApp: ${phone}`);
  return channel;
}

// POST /api/whatsapp/webhook — mensajes entrantes reales de clientes
export const receiveWebhook = async (req: Request, res: Response) => {
  // Responder rápido: Meta reintenta la entrega si no recibe 200 en pocos segundos
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return; // puede ser un evento de "entregado/leído", no un mensaje nuevo

    const fromPhone = message.from;
    const profileName = value.contacts?.[0]?.profile?.name;

    const channelDoc = await resolveOrCreateWhatsAppChannel(fromPhone, profileName);
    const user = await resolveOrCreateWhatsAppUser(fromPhone, profileName);

    let content = '';
    let attachments: string[] = [];

    if (message.type === 'text') {
      content = message.text.body;
    } else if (message.type === 'image' || message.type === 'document') {
      const mediaId = message[message.type].id;
      content = message[message.type].caption || '📎 Adjunto de WhatsApp';
      try {
        const { buffer, mimeType } = await whatsappService.downloadIncomingMedia(mediaId);
        const ext = mimeType.split('/')[1] || 'bin';
        const filename = `wa-${Date.now()}.${ext}`;
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
        attachments = [`${req.protocol}://${req.get('host')}/uploads/${filename}`];
      } catch (mediaError: any) {
        console.error('⚠️ No se pudo descargar adjunto de WhatsApp:', mediaError.message);
      }
    } else {
      content = `[mensaje de tipo ${message.type} no soportado aún]`;
    }

    const created = await Message.create({
      content,
      channel: channelDoc._id,
      sender: user._id,
      type: attachments.length ? 'file' : 'text',
      attachments,
      whatsappMessageId: message.id,
    });

    const populated = await Message.findById(created._id).populate('sender', 'username email avatar status');

    const io = req.app.get('io');
    if (io && populated) {
      io.to(channelDoc._id.toString()).emit('new-message', {
        channelId: channelDoc._id.toString(),
        message: populated,
      });
    }
  } catch (error: any) {
    console.error('❌ Error procesando webhook de WhatsApp:', error.message);
  }
};

// POST /api/whatsapp/join — cualquier usuario logueado puede sumarse al inbox compartido de WhatsApp
export const joinWhatsAppInbox = async (req: AuthRequest, res: Response) => {
  try {
    const channels = await Channel.find({ platform: 'whatsapp' });
    let joined = 0;

    for (const channel of channels) {
      if (!channel.members.some((m: any) => m.toString() === req.userId)) {
        channel.members.push(req.userId as any);
        await channel.save();
        joined++;
      }
    }

    res.json({ success: true, message: `Te uniste a ${joined} conversaciones de WhatsApp`, data: channels });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al unirte al inbox de WhatsApp', error: error.message });
  }
};

export const getStatus = (req: Request, res: Response) => {
  res.json({ success: true, configured: whatsappService.isConfigured() });
};