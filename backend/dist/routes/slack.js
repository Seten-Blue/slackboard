"use strict";
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
// ← CORREGIDO: matching por nombre normalizado en vez de comparación exacta
const resolveOrCreateSlackChannel = async (slackChannelId, channelName) => {
    const fallbackName = channelName || `slack-${slackChannelId}`;
    const normalizedIncoming = normalizeChannelName(fallbackName);
    // 1. Buscar primero por slackChannelId (la forma más confiable una vez vinculado)
    let channel = await Channel_1.default.findOne({ slackChannelId });
    // 2. Si no hay vínculo aún, buscar por nombre normalizado entre todos los canales
    if (!channel) {
        const allChannels = await Channel_1.default.find({});
        const match = allChannels.find((c) => normalizeChannelName(c.name) === normalizedIncoming);
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
    let adminUser = await User_1.default.findOne({ email: 'admin@slackboard.com' }) || await User_1.default.findOne();
    if (!adminUser) {
        throw new Error('No existe un usuario admin para crear el canal sincronizado desde Slack');
    }
    channel = await Channel_1.default.create({
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
router.get('/status', (req, res) => {
    const configured = slackService_1.default.isConfigured();
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
router.post('/sync-channels', auth_1.requireAuth, async (req, res) => {
    try {
        if (!slackService_1.default.isConfigured()) {
            return res.status(400).json({
                success: false,
                message: 'Slack no está configurado. Verifica SLACK_BOT_TOKEN en .env'
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
                // ← NUEVO: agrega como miembro a quien hizo el sync, si todavía no lo era
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
                message: 'Slack no está configurado'
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
// Endpoint para eventos de Slack (webhooks)
router.post('/events', async (req, res) => {
    try {
        console.log('📨 Recibido evento de Slack:', JSON.stringify(req.body, null, 2));
        const { type, challenge, event } = req.body;
        // Verificar que la petición realmente venga de Slack
        const signature = req.headers['x-slack-signature'];
        const timestamp = req.headers['x-slack-request-timestamp'];
        const rawBody = req.rawBody || '';
        if (slackService_1.default.isSignatureVerificationEnabled()) {
            const isValid = slackService_1.default.verifySignature(rawBody, timestamp, signature);
            if (!isValid) {
                console.warn('⚠️  Firma de Slack inválida, petición rechazada');
                return res.status(401).send('Firma inválida');
            }
        }
        else if (!signature || !timestamp) {
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
                            console.log('ℹ️  El canal ya tenía ese nombre en SlackBoard, no se hace nada');
                        }
                    }
                    else {
                        console.warn(`⚠️  Se recibió channel_rename para un canal no vinculado: ${slackChannelId}`);
                    }
                }
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
                        console.warn('⚠️  No se pudo obtener información del canal de Slack:', channelInfoError.message);
                    }
                    const channel = await resolveOrCreateSlackChannel(event.channel, channelName);
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
                            console.error('⚠️ Error disparando integración de IA desde Slack:', aiError.message);
                        }
                    }
                    else {
                        // ← NUEVO: ya no se pierde ningún mensaje en silencio
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
// ===== OAuth por usuario (vinculación real de cuenta) — mismo patrón que Discord =====
router.get('/oauth/status', auth_1.requireAuth, slackOAuthController_1.getOAuthStatus);
router.get('/oauth/start', auth_1.requireAuth, slackOAuthController_1.startOAuth);
router.get('/oauth/callback', slackOAuthController_1.oauthCallback); // público: Slack redirige acá sin nuestro header Authorization
router.post('/oauth/unlink-workspace', auth_1.requireAuth, slackOAuthController_1.unlinkWorkspace);
router.post('/oauth/sync-workspace', auth_1.requireAuth, slackOAuthController_1.syncMyWorkspace);
exports.default = router;
