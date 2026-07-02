import express, { Request, Response } from 'express';
import Channel from '../models/Channel';
import Message from '../models/Message';
import User from '../models/User';
import slackService from '../services/slackService';
import { Server } from 'socket.io';

const router = express.Router();

// ← NUEVO: normaliza nombres para comparar "Los nuevos" con "los-nuevos" como el mismo canal
const normalizeChannelName = (name: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

// ← CORREGIDO: matching por nombre normalizado en vez de comparación exacta
const resolveOrCreateSlackChannel = async (slackChannelId: string, channelName?: string) => {
  const fallbackName = channelName || `slack-${slackChannelId}`;
  const normalizedIncoming = normalizeChannelName(fallbackName);

  // 1. Buscar primero por slackChannelId (la forma más confiable una vez vinculado)
  let channel: any = await Channel.findOne({ slackChannelId });

  // 2. Si no hay vínculo aún, buscar por nombre normalizado entre todos los canales
  if (!channel) {
    const allChannels = await Channel.find({});
    const match = allChannels.find(
      (c: any) => normalizeChannelName(c.name) === normalizedIncoming
    );
    if (match) {
      channel = match;
    }
  }

  // 3. Si lo encontramos por nombre, vincularlo con su slackChannelId para la próxima vez
  if (channel) {
    if (!channel.slackChannelId) {
      channel.slackChannelId = slackChannelId;
      await channel.save();
      console.log(`🔗 Canal "${channel.name}" vinculado con Slack (${slackChannelId})`);
    }
    return channel;
  }

  // 4. Si de verdad no existe en ningún lado, ahí sí se crea uno nuevo
  let adminUser = await User.findOne({ email: 'admin@slackboard.com' }) || await User.findOne();
  if (!adminUser) {
    throw new Error('No existe un usuario admin para crear el canal sincronizado desde Slack');
  }

  channel = await Channel.create({
    name: fallbackName,
    description: `Canal sincronizado desde Slack (${fallbackName})`,
    isPrivate: false,
    members: [adminUser._id],
    createdBy: adminUser._id,
    slackChannelId
  });

  console.log(`➕ Canal nuevo creado desde Slack: ${fallbackName} (${slackChannelId})`);

  return channel;
};

// Estado de la integración
router.get('/status', (req: Request, res: Response) => {
  const configured = slackService.isConfigured();
  res.json({
    success: true,
    configured: configured,
    message: configured 
      ? 'Slack está configurado y funcionando' 
      : 'Slack no está configurado. Usa un Bot User OAuth Token (xoxb-...) y, para recibir mensajes, configura SLACK_SIGNING_SECRET y un endpoint público.',
    token: configured ? 'Bot token válido' : 'Token no válido o no encontrado'
  });
});

// Sincronizar canales de Slack con la base de datos
router.post('/sync-channels', async (req: Request, res: Response) => {
  try {
    if (!slackService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Slack no está configurado. Verifica SLACK_BOT_TOKEN en .env'
      });
    }

    console.log('🔄 Sincronizando canales de Slack...');
    const slackChannels = await slackService.syncChannels();
    
    if (slackChannels.length === 0) {
      return res.json({
        success: true,
        message: 'No se encontraron canales en Slack',
        data: []
      });
    }

    let adminUser = await User.findOne({ email: 'admin@slackboard.com' });
    if (!adminUser) {
      console.log('👤 Creando usuario admin...');
      adminUser = await User.create({
        email: 'admin@slackboard.com',
        username: 'Admin',
        password: 'admin123',
        role: 'admin',
        status: 'online'
      });
    }

    const syncedChannels = [];

    for (const slackChannel of slackChannels) {
      let channel: any = await Channel.findOne({ name: slackChannel.name });
      
      if (!channel) {
        console.log(`➕ Creando canal: ${slackChannel.name}`);
        channel = await Channel.create({
          name: slackChannel.name,
          description: slackChannel.purpose?.value || '',
          isPrivate: slackChannel.is_private || false,
          members: [adminUser._id],
          createdBy: adminUser._id,
          slackChannelId: slackChannel.id // ← NUEVO: guarda el vínculo desde la sincronización
        });
      } else {
        console.log(`✅ Canal ya existe: ${slackChannel.name}`);
        // ← NUEVO: si ya existía pero sin vínculo, lo vinculamos ahora
        if (!channel.slackChannelId) {
          channel.slackChannelId = slackChannel.id;
          await channel.save();
          console.log(`🔗 Canal "${channel.name}" vinculado con Slack (${slackChannel.id})`);
        }
      }

      syncedChannels.push(channel);
    }

    await slackService.refreshChannelMap();

    res.json({
      success: true,
      message: `${syncedChannels.length} canales sincronizados`,
      data: syncedChannels
    });
  } catch (error: any) {
    console.error('❌ Error sincronizando canales:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar canales',
      error: error.message
    });
  }
});

// Enviar mensaje a Slack
router.post('/send-message', async (req: Request, res: Response) => {
  try {
    const { channelName, text, username } = req.body;

    if (!channelName || !text) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere channelName y text'
      });
    }

    if (!slackService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Slack no está configurado'
      });
    }

    console.log(`📤 Enviando mensaje a #${channelName}:`, text);

    const result = await slackService.sendMessage(
      channelName,
      text,
      username || 'SlackBoard'
    );

    res.json({
      success: true,
      message: 'Mensaje enviado a Slack',
      data: {
        channel: channelName,
        timestamp: result?.ts
      }
    });
  } catch (error: any) {
    console.error('❌ Error enviando mensaje:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje',
      error: error.message
    });
  }
});

// Endpoint para eventos de Slack (webhooks)
router.post('/events', async (req: Request, res: Response) => {
  try {
    console.log('📨 Recibido evento de Slack:', JSON.stringify(req.body, null, 2));

    const { type, challenge, event } = req.body;

    // Verificar que la petición realmente venga de Slack
    const signature = req.headers['x-slack-signature'] as string;
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const rawBody = (req as any).rawBody || '';

    if (slackService.isSignatureVerificationEnabled()) {
      const isValid = slackService.verifySignature(rawBody, timestamp, signature);
      if (!isValid) {
        console.warn('⚠️  Firma de Slack inválida, petición rechazada');
        return res.status(401).send('Firma inválida');
      }
    } else if (!signature || !timestamp) {
      console.warn('⚠️  No se recibió firma de Slack; se procesará el evento aunque la verificación esté deshabilitada');
    }

    // Responder al challenge de verificación de URL
    if (type === 'url_verification') {
      console.log('✅ Verificación de URL - Challenge:', challenge);
      return res.status(200).json({ challenge });
    }

    // Manejar eventos de mensajes
    if (type === 'event_callback' && event) {
      console.log('📬 Evento recibido:', event.type);
      
      // Ignorar mensajes del bot para evitar loops
      if (event.bot_id) {
        console.log('⏭️  Ignorando mensaje del bot');
        return res.status(200).send('OK');
      }

      const channelType = (event.channel_type || 'channel').toString();

      // Manejar mensaje de canal público, privado o DM sin depender de un payload exacto
      if (event.type === 'message' && ['channel', 'group', 'im'].includes(channelType)) {
        console.log('💬 Procesando mensaje de Slack');

        if (event.subtype) {
          console.log(`⏭️  Ignorando mensaje con subtype: ${event.subtype}`);
          return res.status(200).send('OK');
        }

        if (!event.text || !event.channel) {
          console.warn('⚠️  Evento de Slack sin texto o canal, se ignora');
          return res.status(200).send('OK');
        }

        const slackUser = await slackService.getUserInfo(event.user);

        let user = await User.findOne({ email: slackUser?.profile?.email });

        if (!user && slackUser) {
          user = await User.create({
            email: slackUser.profile?.email || `slack_${event.user}@slack.com`,
            username: slackUser.real_name || slackUser.name || 'Usuario Slack',
            password: 'slack_user_' + event.user,
            avatar: slackUser.profile?.image_192,
            status: 'online'
          });
        }

        try {
          let channelName = undefined as string | undefined;
          try {
            const channelInfo = await slackService.getClient().conversations.info({
              channel: event.channel
            });
            channelName = channelInfo.channel?.name;
          } catch (channelInfoError: any) {
            console.warn('⚠️  No se pudo obtener información del canal de Slack:', channelInfoError.message);
          }

          const channel: any = await resolveOrCreateSlackChannel(event.channel, channelName);

          if (channel && user) {
            const createdMessage = await Message.create({
              content: event.text,
              channel: channel._id,
              sender: user._id,
              type: 'text'
            });

            const populatedMessage = await Message.findById(createdMessage._id)
              .populate('sender', 'username email avatar status');

            const io = req.app.get('io') as Server;
            if (io && populatedMessage) {
              io.to(channel._id.toString()).emit('new-message', {
                channelId: channel._id.toString(),
                message: populatedMessage
              });
            }

            console.log('✅ Mensaje guardado en MongoDB y emitido al frontend');
          } else {
            // ← NUEVO: ya no se pierde ningún mensaje en silencio
            console.warn(`⚠️  Mensaje de Slack no guardado — channel encontrado: ${!!channel}, user encontrado: ${!!user}`);
          }
        } catch (channelError: any) {
          console.warn('⚠️  No se pudo procesar el canal del evento:', channelError.message);
        }
      }

      return res.status(200).send('OK');
    }

    console.log('ℹ️  Evento no manejado:', type);
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('❌ Error procesando evento de Slack:', error.message);
    console.error(error.stack);
    res.status(500).json({ error: error.message });
  }
});

export default router;