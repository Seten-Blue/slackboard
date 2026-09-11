import express, { Request, Response } from 'express';
import Channel from '../models/Channel';
import Message from '../models/Message';
import User from '../models/User';
import slackService from '../services/slackService';
import { Server } from 'socket.io';
import aiService from '../services/aiService';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getOAuthStatus as getSlackOAuthStatus, startOAuth as startSlackOAuth, oauthCallback as slackOAuthCallback, syncMyWorkspace as syncMySlackWorkspace, unlinkWorkspace as unlinkSlackWorkspace } from '../controllers/slackOAuthController';

const router = express.Router();

// ← NUEVO: normaliza nombres para comparar "Los nuevos" con "los-nuevos" como el mismo canal
const normalizeChannelName = (name: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

// ← CORREGIDO: matching por nombre normalizado en vez de comparacion exacta
const resolveOrCreateSlackChannel = async (slackChannelId: string, channelName?: string, requestingUserId?: string) => {
  const fallbackName = channelName || `slack-${slackChannelId}`;
  const normalizedIncoming = normalizeChannelName(fallbackName);

  // 1. Buscar primero por slackChannelId (la forma mas confiable una vez vinculado)
  let channel: any = await Channel.findOne({ slackChannelId });

  // 2. Si no hay vinculo aun, buscar por nombre normalizado entre todos los canales
  if (!channel) {
    const allChannels = await Channel.find({});
    const match = allChannels.find(
      (c: any) => normalizeChannelName(c.name) === normalizedIncoming
    );
    if (match) {
      channel = match;
    }
  }

  // 3. Si lo encontramos por nombre, vincularlo con su slackChannelId para la proxima vez
  if (channel) {
    if (!channel.slackChannelId) {
      channel.slackChannelId = slackChannelId;
      await channel.save();
      console.log(`🔗 Canal "${channel.name}" vinculado con Slack (${slackChannelId})`);
    }
    if (requestingUserId && channel.members && !channel.members.some((m: any) => m.toString() === requestingUserId)) {
      channel.members.push(requestingUserId);
      await channel.save();
      console.log(`👤 Usuario ${requestingUserId} agregado como miembro del canal "${channel.name}"`);
    }
    return channel;
  }

  // 4. Si de verdad no existe en ningun lado, ahi si se crea uno nuevo
  let adminUser = await User.findOne({ email: 'admin@slackboard.com' }) || await User.findOne();
  if (!adminUser) {
    throw new Error('No existe un usuario admin para crear el canal sincronizado desde Slack');
  }

  const creatorMembers: any[] = [adminUser._id];
  if (requestingUserId && adminUser._id?.toString() !== requestingUserId) {
    creatorMembers.push(requestingUserId);
  }

  channel = await Channel.create({
    name: fallbackName,
    description: `Canal sincronizado desde Slack (${fallbackName})`,
    isPrivate: false,
    members: creatorMembers,
    createdBy: adminUser._id,
    slackChannelId
  });

  console.log(`➕ Canal nuevo creado desde Slack: ${fallbackName} (${slackChannelId})`);

  return channel;
};

// Estado de la integracion
router.get('/status', (req: Request, res: Response) => {
  const configured = slackService.isConfigured();
  res.json({
    success: true,
    configured: configured,
    message: configured 
      ? 'Slack esta configurado y funcionando' 
      : 'Slack no esta configurado. Usa un Bot User OAuth Token (xoxb-...) y, para recibir mensajes, configura SLACK_SIGNING_SECRET y un endpoint publico.',
    token: configured ? 'Bot token valido' : 'Token no valido o no encontrado'
  });
});

// Sincronizar canales de Slack con la base de datos
router.post('/sync-channels', requireAuth, async (req: AuthRequest, res: Response) => {  try {
    if (!slackService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Slack no esta configurado. Verifica SLACK_BOT_TOKEN en .env'
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
      let channel: any = await Channel.findOne({ slackChannelId: slackChannel.id });
      if (!channel) {
        channel = await Channel.findOne({ name: slackChannel.name });
      }
      
      if (!channel) {
        console.log(`➕ Creando canal: ${slackChannel.name}`);
        channel = await Channel.create({
          name: slackChannel.name,
          displayName: slackChannel.name,
          description: slackChannel.purpose?.value || '',
          isPrivate: slackChannel.is_private || false,
          members: [adminUser._id, req.userId],
          createdBy: adminUser._id,
          slackChannelId: slackChannel.id
        });
      } else {
        console.log(`✅ Canal ya existe: ${slackChannel.name}`);
        const changed: boolean = channel.name !== slackChannel.name || channel.displayName !== slackChannel.name;
        if (!channel.slackChannelId) {
          channel.slackChannelId = slackChannel.id;
          console.log(`🔗 Canal "${channel.name}" vinculado con Slack (${slackChannel.id})`);
        }
        if (channel.displayName !== slackChannel.name) {
          channel.displayName = slackChannel.name;
        }
        // ← NUEVO: agrega como miembro a quien hizo el sync, si todavia no lo era
        const alreadyMember = channel.members.some((m: any) => m.toString() === req.userId);
        if (!alreadyMember && req.userId) {
          channel.members.push(req.userId);
        }
        if (changed || channel.isModified()) {
          await channel.save();
        }
      }

      syncedChannels.push(channel);
    }

    await slackService.refreshChannelMap();

    // Poda: eliminar canales de Slack que ya no existen en Slack.
    // Solo se podan los canales sin slackTeamId (creados por este sync global);
    // los canales de workspaces OAuth se podan en sync-workspace por equipo para
    // no eliminar canales privados a los que el bot global no tiene acceso.
    const currentIds = new Set<string>(slackChannels.map((s: any) => s.id));
    const staleChannels = await Channel.find({ platform: 'slack', slackChannelId: { $ne: null }, slackTeamId: null });
    let prunedCount = 0;
    for (const ch of staleChannels) {
      if (ch.slackChannelId && !currentIds.has(String(ch.slackChannelId))) {
        console.log(`🗑️ Canal de Slack obsoleto eliminado: ${ch.name} (${ch.slackChannelId}) ya no existe en Slack`);
        await Channel.findByIdAndDelete(ch._id);
        prunedCount++;
      }
    }

    res.json({
      success: true,
      message: `${syncedChannels.length} canales sincronizados, ${prunedCount} canales obsoletos eliminados`,
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
        message: 'Slack no esta configurado'
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

// Endpoint para eventos de Slack (webhooks) — maneja tanto eventos como interactive payloads
router.post('/events', async (req: Request, res: Response) => {
  try {
    // Slack interactive payloads (button clicks) vienen como payload JSON codificado en form
    const payload = req.body.payload ? JSON.parse(req.body.payload) : null;
    if (payload && payload.type === 'block_actions') {
      console.log('🔘 Interactive payload recibido de Slack:', payload.type);

      const actions = payload.actions || [];
      const userId = payload.user?.id;

      for (const action of actions) {
        const [actionId, friendshipId] = (action.action_id || '').split(':');
        if (!friendshipId || !['friend_accept', 'friend_reject'].includes(actionId)) continue;

        const Friendship = (await import('../models/Friendship')).default;
        const friendship = await Friendship.findById(friendshipId);
        if (!friendship) {
          return res.status(200).json({ text: 'Esta solicitud ya no existe.' });
        }
        if (friendship.status !== 'pending') {
          return res.status(200).json({ text: 'Esta solicitud ya fue procesada.' });
        }

        // Verify the clicking user is the recipient
        const slackUser = await slackService.getUserInfo(userId);
        const mongoUser = slackUser ? await User.findOne({ email: slackUser.profile?.email }) : null;
        if (!mongoUser || !friendship.userB.equals((mongoUser as any)._id)) {
          return res.status(200).json({ text: 'Esta solicitud no es para ti.' });
        }

        if (actionId === 'friend_accept') {
          friendship.status = 'accepted';
          await friendship.save();

          const initiatorUser = await User.findById(friendship.initiator);
          if (initiatorUser?.slackWorkspaces?.length) {
            await slackService.sendFriendAcceptedDM(
              initiatorUser.email,
              mongoUser.username,
            );
          }

          const io = req.app.get('io') as Server;
          if (io) {
            io.to(`user:${friendship.userA}`).emit('friendship:update', { friendshipId, status: 'accepted' });
            io.to(`user:${friendship.userB}`).emit('friendship:update', { friendshipId, status: 'accepted' });
          }

          return res.status(200).json({ text: '✅ Solicitud aceptada!' });
        } else {
          friendship.status = 'rejected';
          await friendship.save();
          return res.status(200).json({ text: '❌ Solicitud rechazada.' });
        }
      }

      return res.status(200).send('OK');
    }

    // Resto: eventos de Slack (event_callback)
    console.log('📨 Recibido evento de Slack:', JSON.stringify(req.body, null, 2));

    const { type, challenge, event } = req.body;

    // Verificar que la peticion realmente venga de Slack
    const signature = req.headers['x-slack-signature'] as string;
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const rawBody = (req as any).rawBody || '';

    if (slackService.isSignatureVerificationEnabled()) {
      const isValid = slackService.verifySignature(rawBody, timestamp, signature);
      if (!isValid) {
        console.warn('⚠️  Firma de Slack invalida, peticion rechazada');
        return res.status(401).send('Firma invalida');
      }
    } else if (!signature || !timestamp) {
      console.warn('⚠️  No se recibio firma de Slack; se procesara el evento aunque la verificacion este deshabilitada');
    }

    // Responder al challenge de verificacion de URL
    if (type === 'url_verification') {
      console.log('✅ Verificacion de URL - Challenge:', challenge);
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

      // Manejar renombrado de canal hecho directamente en Slack
      if (event.type === 'channel_rename' && event.channel) {
        console.log('✏️  Canal renombrado en Slack:', event.channel);

        const slackChannelId = event.channel.id;
        const newName = event.channel.name;

        if (slackChannelId && newName) {
          const channel: any = await Channel.findOne({ slackChannelId });

          if (channel) {
            // Los canales vinculados por OAuth (con slackTeamId) usan un "name"
            // interno con formato "${equipo}-${canal}" para evitar colisiones entre
            // workspaces. En ellos solo se actualiza displayName; su nombre interno
            // se mantiene. Los canales del sync global (sin slackTeamId) usan el
            // nombre de Slack como nombre, asi que se renombran ambos.
            // Cuando el canal usa un "name" interno distinto de displayName
            // (colision de nombre unico entre workspaces/plataformas), solo se
            // actualiza displayName. Si name y displayName coinciden, se renombran ambos.
            // Los canales legacy del sync global quedan cubiertos por este mismo caso.
            const internalName = channel.displayName && channel.name !== channel.displayName;
            const nameChanged = !internalName && channel.name !== newName;
            const displayChanged = channel.displayName !== newName;
            if (nameChanged || displayChanged) {
              if (nameChanged) {
                // Verificar que el nuevo nombre no colisione con otro canal
                const taken = await Channel.findOne({ name: newName, _id: { $ne: channel._id } });
                if (taken) {
                  console.warn(`⚠️  No se puede renombrar a ${newName}: otro canal ya usa ese nombre`);
                } else {
                  channel.name = newName;
                }
              }
              channel.displayName = newName;
              await channel.save();
              console.log(`✅ Canal renombrado en SlackBoard: ${slackChannelId} -> ${newName}`);

              await slackService.refreshChannelMap();

              const io = req.app.get('io') as Server;
              if (io) {
                io.emit('channel-renamed', {
                  channelId: channel._id.toString(),
                  name: channel.name
                });
              }
            } else {
              console.log('ℹ️  El canal ya tenia ese nombre en SlackBoard, no se hace nada');
            }
          } else {
            console.warn(`⚠️  Se recibio channel_rename para un canal no vinculado: ${slackChannelId}`);
          }
        }

        return res.status(200).send('OK');
      }

      // Manejar eliminación de canal en Slack
      if (event.type === 'channel_deleted' && event.channel) {
        console.log('🗑️  Canal eliminado en Slack:', event.channel);

        const slackChannelId = event.channel;
        const channel: any = await Channel.findOne({ slackChannelId });

        if (channel) {
          console.log(`🗑️  Eliminando canal obsoleto de SlackBoard: ${channel.name} (${slackChannelId})`);
          await Channel.findByIdAndDelete(channel._id);

          const io = req.app.get('io') as Server;
          if (io) {
            io.emit('channel-deleted', {
              channelId: channel._id.toString(),
              name: channel.name
            });
          }

          await slackService.refreshChannelMap();
        } else {
          console.log(`ℹ️  Canal eliminado en Slack no estaba vinculado en SlackBoard: ${slackChannelId}`);
        }

        return res.status(200).send('OK');
      }

      // Manejar archivado de canal en Slack
      if (event.type === 'channel_archive' && event.channel) {
        console.log('📦  Canal archivado en Slack:', event.channel);

        const slackChannelId = event.channel;
        const channel: any = await Channel.findOne({ slackChannelId });

        if (channel) {
          console.log(`📦  Archivando canal en SlackBoard: ${channel.name} (${slackChannelId})`);
          await Channel.findByIdAndDelete(channel._id);

          const io = req.app.get('io') as Server;
          if (io) {
            io.emit('channel-deleted', {
              channelId: channel._id.toString(),
              name: channel.name
            });
          }

          await slackService.refreshChannelMap();
        } else {
          console.log(`ℹ️  Canal archivado en Slack no estaba vinculado en SlackBoard: ${slackChannelId}`);
        }

        return res.status(200).send('OK');
      }
      
      const channelType = (event.channel_type || 'channel').toString();

      // Manejar reacciones entrantes de Slack
      if (event.type === 'reaction_added' || event.type === 'reaction_removed') {
        const isAdd = event.type === 'reaction_added';
        const emoji = event.reaction;
        const slackMessageTs = event.item?.ts;
        const slackUserId = event.user;

        if (!emoji || !slackMessageTs || !slackUserId) {
          return res.status(200).send('OK');
        }

        console.log(`👍 Reacción de Slack: ${event.type} emoji=${emoji} ts=${slackMessageTs} user=${slackUserId}`);

        try {
          const slackUser = await slackService.getUserInfo(slackUserId);
          const user = slackUser ? await User.findOne({ email: slackUser.profile?.email }) : null;
          if (!user) {
            console.log('⚠️  Usuario de reacción no encontrado en SlackBoard');
            return res.status(200).send('OK');
          }

          // Buscar el mensaje de SlackBoard por slackMessageTs
          const message: any = await Message.findOne({ slackMessageTs });
          if (!message || message.type !== 'poll' || !message.pollData) {
            return res.status(200).send('OK');
          }

          const pollData = message.pollData as any;
          const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
          const SLACK_EMOJI_MAP: Record<string, number> = {
            'one': 0, 'two': 1, 'three': 2, 'four': 3, 'five': 4,
            'six': 5, 'seven': 6, 'eight': 7, 'nine': 8, 'keycap_ten': 9,
          };
          const optionIndex = SLACK_EMOJI_MAP[emoji] ?? NUM_EMOJIS.indexOf(emoji);
          if (optionIndex === -1 || optionIndex >= pollData.options.length) {
            return res.status(200).send('OK');
          }

          const option = pollData.options[optionIndex];
          const mongoUserId = String(user._id);

          if (isAdd) {
            if (pollData.allowMultiple) {
              const alreadyVoted = option.voters.some((v: any) => v.toString() === mongoUserId);
              if (!alreadyVoted) option.voters.push(user._id);
            } else {
              for (const opt of pollData.options) {
                const idx = opt.voters.findIndex((v: any) => v.toString() === mongoUserId);
                if (idx !== -1) opt.voters.splice(idx, 1);
              }
              const alreadyVoted = option.voters.some((v: any) => v.toString() === mongoUserId);
              if (!alreadyVoted) option.voters.push(user._id);
            }
          } else {
            option.voters = option.voters.filter((v: any) => v.toString() !== mongoUserId);
          }

          message.markModified('pollData');
          await message.save();

          const io = req.app.get('io') as Server;
          if (io) {
            io.to(String(message.channel)).emit('poll-voted', {
              messageId: message._id,
              pollData: message.pollData,
            });
          }

          console.log(`✅ Voto ${isAdd ? 'agregado' : 'removido'} desde Slack: user=${mongoUserId}, option=${optionIndex}`);
        } catch (err: any) {
          console.error('❌ Error procesando reacción de Slack:', err.message);
        }

        return res.status(200).send('OK');
      }

      // Manejar mensaje de canal publico, privado o DM sin depender de un payload exacto
      if (event.type === 'message' && ['channel', 'group', 'im'].includes(channelType)) {
        console.log('💬 Procesando mensaje de Slack');

        if (event.subtype || event.bot_id) {
          console.log(`⏭️  Ignorando mensaje con subtype/bot_id: ${event.subtype || event.bot_id}`);
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
            console.warn('⚠️  No se pudo obtener informacion del canal de Slack:', channelInfoError.message);
          }

          const channel: any = await resolveOrCreateSlackChannel(event.channel, channelName, user?._id?.toString());

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

            try {
              const io = req.app.get('io') as Server;
              await aiService.checkAndRespond({
                text: event.text,
                channel,
                io,
              });
            } catch (aiError: any) {
              console.error('⚠️ Error disparando integracion de IA desde Slack:', aiError.message);
            }
          } else {
            // ← NUEVO: ya no se pierde ningun mensaje en silencio
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


// ===== OAuth por usuario (vinculacion real de cuenta) — mismo patron que Discord =====
router.get('/oauth/status', requireAuth, getSlackOAuthStatus);
router.get('/oauth/start', requireAuth, startSlackOAuth);
router.get('/oauth/callback', slackOAuthCallback); // publico: Slack redirige aca sin nuestro header Authorization
router.post('/oauth/unlink-workspace', requireAuth, unlinkSlackWorkspace);
router.post('/oauth/sync-workspace', requireAuth, syncMySlackWorkspace);


export default router;