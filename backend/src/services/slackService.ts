import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

// Flag para silenciar errores de Slack
const SILENT_MODE = true; // Cambiar a false para ver errores de Slack

class SlackService {
  private client: WebClient;
  private botToken: string;
  private channelMap: Map<string, string> = new Map();

  constructor() {
    this.botToken = process.env.SLACK_BOT_TOKEN || '';
    this.client = new WebClient(this.botToken);
  }

  isConfigured(): boolean {
    return !!this.botToken && this.botToken.startsWith('xoxb-');
  }

  getClient(): WebClient {
    return this.client;
  }

  async syncChannels() {
    if (!this.isConfigured()) {
      if (!SILENT_MODE) console.log('⚠️ Slack no configurado');
      return [];
    }

    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true
      });

      return result.channels || [];
    } catch (error: any) {
      // Silenciar errores de autenticación
      if (error.data?.error === 'invalid_auth' || error.data?.error === 'account_inactive') {
        if (!SILENT_MODE) console.log('⚠️ Slack no disponible (token inválido)');
      } else {
        console.error('Error obteniendo canales de Slack:', error.message);
      }
      return [];
    }
  }

  async refreshChannelMap() {
    if (!this.isConfigured()) {
      return;
    }

    try {
      const channels = await this.syncChannels();
      this.channelMap.clear();
      
      channels.forEach((channel: any) => {
        if (channel.name && channel.id) {
          this.channelMap.set(channel.name.toLowerCase(), channel.id);
        }
      });

      if (!SILENT_MODE) {
        console.log(`✅ Mapa de canales actualizado: ${this.channelMap.size} canales`);
      }
    } catch (error: any) {
      if (error.data?.error === 'invalid_auth' || error.data?.error === 'account_inactive') {
        // Silenciar
      } else {
        console.error('Error refrescando mapa de canales:', error.message);
      }
    }
  }

  async sendMessage(channelName: string, text: string, username?: string) {
    if (!this.isConfigured()) {
      if (!SILENT_MODE) console.log('💬 Mensaje guardado solo en MongoDB (Slack no configurado)');
      return null;
    }

    try {
      const channelId = this.channelMap.get(channelName.toLowerCase());
      
      if (!channelId) {
        if (!SILENT_MODE) {
          console.log(`⚠️ Canal "${channelName}" no encontrado en Slack`);
        }
        return null;
      }

      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: text,
        username: username || 'SlackBoard Bot'
      });

      if (!SILENT_MODE) console.log('✅ Mensaje enviado a Slack');
      return result;
    } catch (error: any) {
      if (error.data?.error === 'invalid_auth' || error.data?.error === 'account_inactive') {
        if (!SILENT_MODE) console.log('⚠️ Slack no disponible, mensaje guardado solo en MongoDB');
      } else {
        console.error('Error enviando mensaje a Slack:', error.message);
      }
      return null;
    }
  }

  async getUserInfo(userId: string) {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const result = await this.client.users.info({ user: userId });
      return result.user;
    } catch (error: any) {
      if (error.data?.error === 'invalid_auth' || error.data?.error === 'account_inactive') {
        // Silenciar
      } else {
        console.error('Error obteniendo info de usuario:', error.message);
      }
      return null;
    }
  }
}

export default new SlackService();