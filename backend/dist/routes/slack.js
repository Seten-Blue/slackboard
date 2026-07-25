"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Channel_1 = __importDefault(require("../models/Channel"));
const Message_1 = __importDefault(require("../models/Message"));
const User_1 = __importDefault(require("../models/User"));
const slackService_1 = __importDefault(require("../services/slackService"));
const aiService_1 = __importDefault(require("../services/aiService"));
const auth_1 = require("../middleware/auth");
const slackOAuthController_1 = require("../controllers/slackOAuthController");
const router = express_1.default.Router();
// ← NUEVO: normaliza nombres para comparar "Los nuevos" con "los-nuevos" como el mismo canal
const normalizeChannelName = (name) => (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
// ← CORREGIDO: matching por nombre normalizado en vez de comparacion exacta
const resolveOrCreateSlackChannel = async (slackChannelId, channelName, requestingUserId) => {
    const fallbackName = channelName || `slack-${slackChannelId}`;
    const normalizedIncoming = normalizeChannelName(fallbackName);
    // 1. Buscar primero por slackChannelId (la forma mas confiable una vez vinculado)
    let channel = await Channel_1.default.findOne({ slackChannelId });
    // 2. Si no hay vinculo aun, buscar por nombre normalizado entre todos los canales
    if (!channel) {
        const allChannels = await Channel_1.default.find({});
        const match = allChannels.find((c) => normalizeChannelName(c.name) === normalizedIncoming);
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
        if (requestingUserId && channel.members && !channel.members.some((m) => m.toString() === requestingUserId)) {
            channel.members.push(requestingUserId);
            await channel.save();
            console.log(`👤 Usuario ${requestingUserId} agregado como miembro del canal "${channel.name}"`);
        }
        return channel;
    }
    // 4. Si de verdad no existe en ningun lado, ahi si se crea uno nuevo
    let adminUser = await User_1.default.findOne({ email: 'admin@slackboard.com' }) || await User_1.default.findOne();
    if (!adminUser) {
        throw new Error('No existe un usuario admin para crear el canal sincronizado desde Slack');
    }
    const creatorMembers = [adminUser._id];
    if (requestingUserId && adminUser._id?.toString() !== requestingUserId) {
        creatorMembers.push(requestingUserId);
    }
    channel = await Channel_1.default.create({
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
router.get('/status', (req, res) => {
    const configured = slackService_1.default.isConfigured();
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
router.post('/sync-channels', auth_1.requireAuth, async (req, res) => {
    try {
        if (!slackService_1.default.isConfigured()) {
            return res.status(400).json({
                success: false,
                message: 'Slack no esta configurado. Verifica SLACK_BOT_TOKEN en .env'
            });
        }
        console.log('🔄 Sincronizando canales de Slack...');
        const slackChannels = await slackService_1.default.syncChannels();
        if (slackChannels.length === 0) {
            return res.json({
                success: true,
                message: 'No se encontraron canales en Slack',
                data: []
            });
        }
        let adminUser = await User_1.default.findOne({ email: 'admin@slackboard.com' });
        if (!adminUser) {
            console.log('👤 Creando usuario admin...');
            adminUser = await User_1.default.create({
                email: 'admin@slackboard.com',
                username: 'Admin',
                password: 'admin123',
                role: 'admin',
                status: 'online'
            });
        }
        const syncedChannels = [];
        for (const slackChannel of slackChannels) {
            let channel = await Channel_1.default.findOne({ name: slackChannel.name });
            if (!channel) {
                console.log(`➕ Creando canal: ${slackChannel.name}`);
                channel = await Channel_1.default.create({
                    name: slackChannel.name,
                    description: slackChannel.purpose?.value || '',
                    isPrivate: slackChannel.is_private || false,
                    members: [adminUser._id, req.userId],
                    createdBy: adminUser._id,
                    slackChannelId: slackChannel.id
                });
            }
            else {
                console.log(`✅ Canal ya existe: ${slackChannel.name}`);
                if (!channel.slackChannelId) {
                    channel.slackChannelId = slackChannel.id;
                    console.log(`🔗 Canal "${channel.name}" vinculado con Slack (${slackChannel.id})`);
                }
                // ← NUEVO: agrega como miembro a quien hizo el sync, si todavia no lo era
                const alreadyMember = channel.members.some((m) => m.toString() === req.userId);
                if (!alreadyMember && req.userId) {
                    channel.members.push(req.userId);
                }
                await channel.save();
            }
            syncedChannels.push(channel);
        }
        await slackService_1.default.refreshChannelMap();
        res.json({
            success: true,
            message: `${syncedChannels.length} canales sincronizados`,
            data: syncedChannels
        });
    }
    catch (error) {
        console.error('❌ Error sincronizando canales:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al sincronizar canales',
            error: error.message
        });
    }
});
// Enviar mensaje a Slack
router.post('/send-message', async (req, res) => {
    try {
        const { channelName, text, username } = req.body;
        if (!channelName || !text) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere channelName y text'
            });
        }
        if (!slackService_1.default.isConfigured()) {
            return res.status(400).json({
                success: false,
                message: 'Slack no esta configurado'
            });
        }
        console.log(`📤 Enviando mensaje a #${channelName}:`, text);
        const result = await slackService_1.default.sendMessage(channelName, text, username || 'SlackBoard');
        res.json({
            success: true,
            message: 'Mensaje enviado a Slack',
            data: {
                channel: channelName,
                timestamp: result?.ts
            }
        });
    }
    catch (error) {
        console.error('❌ Error enviando mensaje:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al enviar mensaje',
            error: error.message
        });
    }
});
// Endpoint para eventos de Slack (webhooks) — maneja tanto eventos como interactive payloads
router.post('/events', async (req, res) => {
    try {
        // Slack interactive payloads (button clicks) vienen como payload JSON codificado en form
        const payload = req.body.payload ? JSON.parse(req.body.payload) : null;
        if (payload && payload.type === 'block_actions') {
            console.log('🔘 Interactive payload recibido de Slack:', payload.type);
            const actions = payload.actions || [];
            const userId = payload.user?.id;
            for (const action of actions) {
                const [actionId, friendshipId] = (action.action_id || '').split(':');
                if (!friendshipId || !['friend_accept', 'friend_reject'].includes(actionId))
                    continue;
                const Friendship = (await Promise.resolve().then(() => __importStar(require('../models/Friendship')))).default;
                const friendship = await Friendship.findById(friendshipId);
                if (!friendship) {
                    return res.status(200).json({ text: 'Esta solicitud ya no existe.' });
                }
                if (friendship.status !== 'pending') {
                    return res.status(200).json({ text: 'Esta solicitud ya fue procesada.' });
                }
                // Verify the clicking user is the recipient
                const slackUser = await slackService_1.default.getUserInfo(userId);
                const mongoUser = slackUser ? await User_1.default.findOne({ email: slackUser.profile?.email }) : null;
                if (!mongoUser || !friendship.userB.equals(mongoUser._id)) {
                    return res.status(200).json({ text: 'Esta solicitud no es para vos.' });
                }
                if (actionId === 'friend_accept') {
                    friendship.status = 'accepted';
                    await friendship.save();
                    const initiatorUser = await User_1.default.findById(friendship.initiator);
                    if (initiatorUser?.slackWorkspaces?.length) {
                        await slackService_1.default.sendFriendAcceptedDM(initiatorUser.email, mongoUser.username);
                    }
                    const io = req.app.get('io');
                    if (io) {
                        io.to(`user:${friendship.userA}`).emit('friendship:update', { friendshipId, status: 'accepted' });
                        io.to(`user:${friendship.userB}`).emit('friendship:update', { friendshipId, status: 'accepted' });
                    }
                    return res.status(200).json({ text: '✅ Solicitud aceptada!' });
                }
                else {
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
        const signature = req.headers['x-slack-signature'];
        const timestamp = req.headers['x-slack-request-timestamp'];
        const rawBody = req.rawBody || '';
        if (slackService_1.default.isSignatureVerificationEnabled()) {
            const isValid = slackService_1.default.verifySignature(rawBody, timestamp, signature);
            if (!isValid) {
                console.warn('⚠️  Firma de Slack invalida, peticion rechazada');
                return res.status(401).send('Firma invalida');
            }
        }
        else if (!signature || !timestamp) {
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
                    const channel = await Channel_1.default.findOne({ slackChannelId });
                    if (channel) {
                        if (channel.name !== newName) {
                            channel.name = newName;
                            await channel.save();
                            console.log(`✅ Canal renombrado en SlackBoard: ${slackChannelId} -> ${newName}`);
                            await slackService_1.default.refreshChannelMap();
                            const io = req.app.get('io');
                            if (io) {
                                io.emit('channel-renamed', {
                                    channelId: channel._id.toString(),
                                    name: channel.name
                                });
                            }
                        }
                        else {
                            console.log('ℹ️  El canal ya tenia ese nombre en SlackBoard, no se hace nada');
                        }
                    }
                    else {
                        console.warn(`⚠️  Se recibio channel_rename para un canal no vinculado: ${slackChannelId}`);
                    }
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
                    const slackUser = await slackService_1.default.getUserInfo(slackUserId);
                    const user = slackUser ? await User_1.default.findOne({ email: slackUser.profile?.email }) : null;
                    if (!user) {
                        console.log('⚠️  Usuario de reacción no encontrado en SlackBoard');
                        return res.status(200).send('OK');
                    }
                    // Buscar el mensaje de SlackBoard por slackMessageTs
                    const message = await Message_1.default.findOne({ slackMessageTs });
                    if (!message || message.type !== 'poll' || !message.pollData) {
                        return res.status(200).send('OK');
                    }
                    const pollData = message.pollData;
                    const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                    const SLACK_EMOJI_MAP = {
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
                            const alreadyVoted = option.voters.some((v) => v.toString() === mongoUserId);
                            if (!alreadyVoted)
                                option.voters.push(user._id);
                        }
                        else {
                            for (const opt of pollData.options) {
                                const idx = opt.voters.findIndex((v) => v.toString() === mongoUserId);
                                if (idx !== -1)
                                    opt.voters.splice(idx, 1);
                            }
                            const alreadyVoted = option.voters.some((v) => v.toString() === mongoUserId);
                            if (!alreadyVoted)
                                option.voters.push(user._id);
                        }
                    }
                    else {
                        option.voters = option.voters.filter((v) => v.toString() !== mongoUserId);
                    }
                    message.markModified('pollData');
                    await message.save();
                    const io = req.app.get('io');
                    if (io) {
                        io.to(String(message.channel)).emit('poll-voted', {
                            messageId: message._id,
                            pollData: message.pollData,
                        });
                    }
                    console.log(`✅ Voto ${isAdd ? 'agregado' : 'removido'} desde Slack: user=${mongoUserId}, option=${optionIndex}`);
                }
                catch (err) {
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
                const slackUser = await slackService_1.default.getUserInfo(event.user);
                let user = await User_1.default.findOne({ email: slackUser?.profile?.email });
                if (!user && slackUser) {
                    user = await User_1.default.create({
                        email: slackUser.profile?.email || `slack_${event.user}@slack.com`,
                        username: slackUser.real_name || slackUser.name || 'Usuario Slack',
                        password: 'slack_user_' + event.user,
                        avatar: slackUser.profile?.image_192,
                        status: 'online'
                    });
                }
                try {
                    let channelName = undefined;
                    try {
                        const channelInfo = await slackService_1.default.getClient().conversations.info({
                            channel: event.channel
                        });
                        channelName = channelInfo.channel?.name;
                    }
                    catch (channelInfoError) {
                        console.warn('⚠️  No se pudo obtener informacion del canal de Slack:', channelInfoError.message);
                    }
                    const channel = await resolveOrCreateSlackChannel(event.channel, channelName, user?._id?.toString());
                    if (channel && user) {
                        const createdMessage = await Message_1.default.create({
                            content: event.text,
                            channel: channel._id,
                            sender: user._id,
                            type: 'text'
                        });
                        const populatedMessage = await Message_1.default.findById(createdMessage._id)
                            .populate('sender', 'username email avatar status');
                        const io = req.app.get('io');
                        if (io && populatedMessage) {
                            io.to(channel._id.toString()).emit('new-message', {
                                channelId: channel._id.toString(),
                                message: populatedMessage
                            });
                        }
                        console.log('✅ Mensaje guardado en MongoDB y emitido al frontend');
                        try {
                            const io = req.app.get('io');
                            await aiService_1.default.checkAndRespond({
                                text: event.text,
                                channel,
                                io,
                            });
                        }
                        catch (aiError) {
                            console.error('⚠️ Error disparando integracion de IA desde Slack:', aiError.message);
                        }
                    }
                    else {
                        // ← NUEVO: ya no se pierde ningun mensaje en silencio
                        console.warn(`⚠️  Mensaje de Slack no guardado — channel encontrado: ${!!channel}, user encontrado: ${!!user}`);
                    }
                }
                catch (channelError) {
                    console.warn('⚠️  No se pudo procesar el canal del evento:', channelError.message);
                }
            }
            return res.status(200).send('OK');
        }
        console.log('ℹ️  Evento no manejado:', type);
        res.status(200).send('OK');
    }
    catch (error) {
        console.error('❌ Error procesando evento de Slack:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: error.message });
    }
});
// ===== OAuth por usuario (vinculacion real de cuenta) — mismo patron que Discord =====
router.get('/oauth/status', auth_1.requireAuth, slackOAuthController_1.getOAuthStatus);
router.get('/oauth/start', auth_1.requireAuth, slackOAuthController_1.startOAuth);
router.get('/oauth/callback', slackOAuthController_1.oauthCallback); // publico: Slack redirige aca sin nuestro header Authorization
router.post('/oauth/unlink-workspace', auth_1.requireAuth, slackOAuthController_1.unlinkWorkspace);
router.post('/oauth/sync-workspace', auth_1.requireAuth, slackOAuthController_1.syncMyWorkspace);
exports.default = router;
