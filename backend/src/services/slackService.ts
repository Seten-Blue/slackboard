import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

class SlackService {
  private client: WebClient;
  private channelMap: Map<string, string> = new Map();
  private readonly token: string;

  constructor() {
    this.token = (process.env.SLACK_BOT_TOKEN || '').trim();

    if (!this.token) {
      console.warn('⚠️  SLACK_BOT_TOKEN no configurado. La integración con Slack no funcionará.');
      this.client = new WebClient();
      return;
    }

    this.client = new WebClient(this.token);

    if (!this.token.startsWith('xoxb-') || this.token === 'xoxb-your-bot-token-here') {
      console.error('⚠️  Se detectó un token de Slack inválido o de ejemplo. Debe usar un Bot User OAuth Token real (xoxb-...) para enviar y recibir mensajes.');
      return;
    }

    console.log('✅ Slack SDK inicializado');
    this.initializeChannelMap();
  }

  private async initializeChannelMap() {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',  // ← CAMBIO: agregado private_channel
        exclude_archived: true,
        limit: 200
      });

      if (result.channels) {
        result.channels.forEach((channel: any) => {
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

      // Buscar el ID del canal
      let slackChannelId = this.channelMap.get(channelName.toLowerCase());

      // Si no existe, refrescar el mapa
      if (!slackChannelId) {
        console.log(`🔄 Canal ${channelName} no encontrado, refrescando mapa...`);
        await this.initializeChannelMap();
        slackChannelId = this.channelMap.get(channelName.toLowerCase());
      }

      // Si aún no existe, NO crear el canal, solo reportar error
      if (!slackChannelId) {
        throw new Error(`Canal "${channelName}" no encontrado en Slack. Créalo primero o invita al bot.`);
      }

      try {
        // Enviar el mensaje
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
        types: 'public_channel,private_channel',  // ← CAMBIO
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

  getClient(): WebClient {
    return this.client;
  }

  async refreshChannelMap(): Promise<void> {
    await this.initializeChannelMap();
  }
}

export default new SlackService();