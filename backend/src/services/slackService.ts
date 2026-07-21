import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

class SlackService {
  private client: WebClient;
  private channelMap: Map<string, string> = new Map();
  private readonly token: string;
  private readonly signingSecret: string;

  private normalizeChannelName(name: string): string {
    return (name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  }

  constructor() {
    this.token = (process.env.SLACK_BOT_TOKEN || '').trim();
    this.signingSecret = (process.env.SLACK_SIGNING_SECRET || '').trim();

    if (!this.signingSecret) {
      console.warn('⚠️  SLACK_SIGNING_SECRET no configurado. Los eventos entrantes no se verificaran (inseguro para produccion).');
    }

    if (!this.token) {
      console.warn('⚠️  SLACK_BOT_TOKEN no configurado. La integracion con Slack no funcionara.');
      this.client = new WebClient();
      return;
    }

    this.client = new WebClient(this.token);

    if (!this.token.startsWith('xoxb-') || this.token === 'xoxb-your-bot-token-here') {
      console.error('⚠️  Se detecto un token de Slack invalido o de ejemplo. Debe usar un Bot User OAuth Token real (xoxb-...) para enviar y recibir mensajes.');
      return;
    }

    console.log('✅ Slack SDK inicializado');
    this.initializeChannelMap();
  }

  private async initializeChannelMap() {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200
      });

      if (result.channels) {
        result.channels.forEach((channel: any) => {
          const normalizedName = this.normalizeChannelName(channel.name);
          this.channelMap.set(normalizedName, channel.id);
          this.channelMap.set(channel.name.toLowerCase(), channel.id);
          console.log(`📌 Canal mapeado: ${channel.name} -> ${channel.id}`);
        });
      }
    } catch (error: any) {
      console.error('Error obteniendo canales de Slack:', error.message);
    }
  }

  async sendMessage(channelName: string, text: string, username?: string): Promise<any> {
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
        throw new Error(`Canal "${channelName}" no encontrado en Slack. Crealo primero o invita al bot.`);
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
      } catch (error: any) {
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
          } catch (joinError: any) {
            if (joinError?.data?.error === 'missing_scope') {
              throw new Error('El token de Slack no tiene el scope channels:join. Anadelo en OAuth & Permissions y vuelve a instalar la app.');
            }

            throw new Error(`El bot no pudo entrar al canal ${channelName}. Invitalo manualmente desde Slack o verifica los permisos de la app.`);
          }
        }

        if (error?.data?.error === 'missing_scope') {
          throw new Error('El token de Slack no tiene los scopes necesarios. Revisa channels:read, channels:join, chat:write y users:read en OAuth & Permissions.');
        }

        throw error;
      }
    } catch (error: any) {
      console.error('❌ Error enviando mensaje a Slack:', error.message);
      throw error;
    }
  }

  async getChannelHistory(channelName: string, limit = 50): Promise<any[]> {
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
    } catch (error: any) {
      console.error('Error obteniendo historial de Slack:', error.message);
      return [];
    }
  }

  async getUserInfo(userId: string): Promise<any> {
    try {
      if (!this.isConfigured()) {
        return null;
      }

      const result = await this.client.users.info({
        user: userId
      });

      return result.user;
    } catch (error: any) {
      console.error('Error obteniendo info de usuario:', error.message);
      return null;
    }
  }

  async syncChannels(): Promise<any[]> {
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
    } catch (error: any) {
      console.error('Error sincronizando canales:', error.message);
      return [];
    }
  }

  isConfigured(): boolean {
    return !!this.token && this.token.startsWith('xoxb-') && this.token !== 'xoxb-your-bot-token-here';
  }

  isSignatureVerificationEnabled(): boolean {
    return !!this.signingSecret;
  }

  getClient(): WebClient {
    return this.client;
  }

  async refreshChannelMap(): Promise<void> {
    await this.initializeChannelMap();
  }
  

// Hacer que el bot abandone un canal de Slack
async leaveChannel(channelId: string): Promise<any> {
  try {
    if (!this.isConfigured()) {
      return null;
    }

    const result = await this.client.conversations.leave({
      channel: channelId
    });

    console.log(`✅ Bot salio del canal ${channelId}`);

    return result;

  } catch (error: any) {
    console.error('❌ Error abandonando el canal en Slack:', error.message);
    throw error;
  }
}


  // Renombrar un canal en Slack
async renameChannel(channelId: string, newName: string): Promise<any> {
  try {
    if (!this.isConfigured()) {
      return null;
    }

    const normalizedName = this.normalizeChannelName(newName);

    const result = await this.client.conversations.rename({
      channel: channelId,
      name: normalizedName
    });

    // Actualizar el mapa de canales
    await this.refreshChannelMap();

    console.log(`✅ Canal renombrado en Slack: ${normalizedName}`);

    return result;

  } catch (error: any) {
    console.error('❌ Error renombrando canal en Slack:', error.message);
    throw error;
  }
}

  // ← NUEVO: verifica que la peticion realmente venga de Slack usando el Signing Secret
  verifySignature(rawBody: string, timestamp: string, signature: string): boolean {
    if (!this.signingSecret) {
      console.warn('⚠️  SLACK_SIGNING_SECRET no configurado, se omite verificacion de firma (inseguro, configuralo pronto).');
      return true; // no bloqueamos mientras no tengas el secret puesto
    }

    if (!timestamp || !signature || !rawBody) {
      return false;
    }

    // Evitar replay attacks: rechazar timestamps de mas de 5 minutos
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (Number(timestamp) < fiveMinutesAgo) {
      return false;
    }

    const baseString = `v0:${timestamp}:${rawBody}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', this.signingSecret)
      .update(baseString, 'utf8')
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(mySignature, 'utf8'),
        Buffer.from(signature, 'utf8')
      );
    } catch {
      return false;
    }
  }
}

export default new SlackService();