import express, { Request, Response } from 'express';
import Channel from '../models/Channel';
import Message from '../models/Message';
import User from '../models/User';
import slackService from '../services/slackService';

const router = express.Router();

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
      let channel = await Channel.findOne({ name: slackChannel.name });
      
      if (!channel) {
        console.log(`➕ Creando canal: ${slackChannel.name}`);
        channel = await Channel.create({
          name: slackChannel.name,
          description: slackChannel.purpose?.value || '',
          isPrivate: slackChannel.is_private || false,
          members: [adminUser._id],
          createdBy: adminUser._id
        });
      } else {
        console.log(`✅ Canal ya existe: ${slackChannel.name}`);
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

      // Manejar mensaje de canal o DM
      if (event.type === 'message' && (event.channel_type === 'channel' || event.channel_type === 'im')) {
        console.log('💬 Procesando mensaje de Slack');

        if (event.subtype) {
          console.log(`⏭️  Ignorando mensaje con subtype: ${event.subtype}`);
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
          const channelInfo = await slackService.getClient().conversations.info({
            channel: event.channel
          });

          const channelName = channelInfo.channel?.name;
          const channel = await Channel.findOne({ name: channelName });

          if (channel && user) {
            await Message.create({
              content: event.text,
              channel: channel._id,
              sender: user._id,
              type: 'text'
            });
            console.log('✅ Mensaje guardado en MongoDB');
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
