"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web_api_1 = require("@slack/web-api");
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
dotenv_1.default.config();
class SlackService {
    normalizeChannelName(name) {
        return (name || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-');
    }
    constructor() {
        this.channelMap = new Map();
        this.token = (process.env.SLACK_BOT_TOKEN || '').trim();
        this.signingSecret = (process.env.SLACK_SIGNING_SECRET || '').trim();
        if (!this.signingSecret) {
            console.warn('⚠️  SLACK_SIGNING_SECRET no configurado. Los eventos entrantes no se verificarán (inseguro para producción).');
        }
        if (!this.token) {
            console.warn('⚠️  SLACK_BOT_TOKEN no configurado. La integración con Slack no funcionará.');
            this.client = new web_api_1.WebClient();
            return;
        }
        this.client = new web_api_1.WebClient(this.token);
        if (!this.token.startsWith('xoxb-') || this.token === 'xoxb-your-bot-token-here') {
            console.error('⚠️  Se detectó un token de Slack inválido o de ejemplo. Debe usar un Bot User OAuth Token real (xoxb-...) para enviar y recibir mensajes.');
            return;
        }
        console.log('✅ Slack SDK inicializado');
        this.initializeChannelMap();
    }
    async initializeChannelMap() {
        try {
            const result = await this.client.conversations.list({
                types: 'public_channel,private_channel',
                exclude_archived: true,
                limit: 200
            });
            if (result.channels) {
                result.channels.forEach((channel) => {
                    const normalizedName = this.normalizeChannelName(channel.name);
                    this.channelMap.set(normalizedName, channel.id);
                    this.channelMap.set(channel.name.toLowerCase(), channel.id);
                    console.log(`📌 Canal mapeado: ${channel.name} -> ${channel.id}`);
                });
            }
        }
        catch (error) {
            console.error('Error obteniendo canales de Slack:', error.message);
        }
    }
    async sendMessage(channelName, text, username) {
        try {
            if (!this.isConfigured()) {
                console.log('Slack no configurado, mensaje solo local:', { channelName, text });
                return null;
            }
            const normalizedChannelName = this.normalizeChannelName(channelName);
            let slackChannelId = this.channelMap.get(normalizedChannelName) || this.channelMap.get(channelName.toLowerCase());
            if (!slackChannelId) {
                console.log(`🔄 Canal ${channelName} no encontrado, refrescando mapa...`);
                await this.initializeChannelMap();
                slackChannelId = this.channelMap.get(normalizedChannelName) || this.channelMap.get(channelName.toLowerCase());
            }
            if (!slackChannelId) {
                throw new Error(`Canal "${channelName}" no encontrado en Slack. Créalo primero o invita al bot.`);
            }
            try {
                const result = await this.client.chat.postMessage({
                    channel: slackChannelId,
                    text: text,
                    username: username || 'SlackBoard Bot',
                    icon_emoji: ':robot_face:'
                });
                console.log('✅ Mensaje enviado a Slack:', result.ts);
                return result;
            }
            catch (error) {
                if (error?.data?.error === 'not_in_channel') {
                    console.log(`🔄 Bot no estaba en el canal ${channelName}. Intentando entrar...`);
                    try {
                        await this.client.conversations.join({ channel: slackChannelId });
                        const retryResult = await this.client.chat.postMessage({
                            channel: slackChannelId,
                            text: text,
                            username: username || 'SlackBoard Bot',
                            icon_emoji: ':robot_face:'
                        });
                        console.log('✅ Mensaje enviado a Slack tras unirse al canal:', retryResult.ts);
                        return retryResult;
                    }
                    catch (joinError) {
                        if (joinError?.data?.error === 'missing_scope') {
                            throw new Error('El token de Slack no tiene el scope channels:join. Añádelo en OAuth & Permissions y vuelve a instalar la app.');
                        }
                        throw new Error(`El bot no pudo entrar al canal ${channelName}. Invítalo manualmente desde Slack o verifica los permisos de la app.`);
                    }
                }
                if (error?.data?.error === 'missing_scope') {
                    throw new Error('El token de Slack no tiene los scopes necesarios. Revisa channels:read, channels:join, chat:write y users:read en OAuth & Permissions.');
                }
                throw error;
            }
        }
        catch (error) {
            console.error('❌ Error enviando mensaje a Slack:', error.message);
            throw error;
        }
    }
    async getChannelHistory(channelName, limit = 50) {
        try {
            if (!this.isConfigured()) {
                return [];
            }
            const slackChannelId = this.channelMap.get(channelName.toLowerCase());
            if (!slackChannelId) {
                console.log(`Canal ${channelName} no encontrado en Slack`);
                return [];
            }
            const result = await this.client.conversations.history({
                channel: slackChannelId,
                limit: limit
            });
            return result.messages || [];
        }
        catch (error) {
            console.error('Error obteniendo historial de Slack:', error.message);
            return [];
        }
    }
    async getUserInfo(userId) {
        try {
            if (!this.isConfigured()) {
                return null;
            }
            const result = await this.client.users.info({
                user: userId
            });
            return result.user;
        }
        catch (error) {
            console.error('Error obteniendo info de usuario:', error.message);
            return null;
        }
    }
    async syncChannels() {
        try {
            if (!this.isConfigured()) {
                return [];
            }
            const result = await this.client.conversations.list({
                types: 'public_channel,private_channel',
                exclude_archived: true,
                limit: 200
            });
            return result.channels || [];
        }
        catch (error) {
            console.error('Error sincronizando canales:', error.message);
            return [];
        }
    }
    isConfigured() {
        return !!this.token && this.token.startsWith('xoxb-') && this.token !== 'xoxb-your-bot-token-here';
    }
    isSignatureVerificationEnabled() {
        return !!this.signingSecret;
    }
    getClient() {
        return this.client;
    }
    async refreshChannelMap() {
        await this.initializeChannelMap();
    }
    // ← NUEVO: verifica que la petición realmente venga de Slack usando el Signing Secret
    verifySignature(rawBody, timestamp, signature) {
        if (!this.signingSecret) {
            console.warn('⚠️  SLACK_SIGNING_SECRET no configurado, se omite verificación de firma (inseguro, configúralo pronto).');
            return true; // no bloqueamos mientras no tengas el secret puesto
        }
        if (!timestamp || !signature || !rawBody) {
            return false;
        }
        // Evitar replay attacks: rechazar timestamps de más de 5 minutos
        const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
        if (Number(timestamp) < fiveMinutesAgo) {
            return false;
        }
        const baseString = `v0:${timestamp}:${rawBody}`;
        const mySignature = 'v0=' + crypto_1.default
            .createHmac('sha256', this.signingSecret)
            .update(baseString, 'utf8')
            .digest('hex');
        try {
            return crypto_1.default.timingSafeEqual(Buffer.from(mySignature, 'utf8'), Buffer.from(signature, 'utf8'));
        }
        catch {
            return false;
        }
    }
}
exports.default = new SlackService();
