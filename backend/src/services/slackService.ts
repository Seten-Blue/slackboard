import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

class SlackService {
  private client: WebClient | null = null;
  private channelMap: Map<string, string> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize() {
    const token = process.env.SLACK_BOT_TOKEN;
    
    if (!token) {
      console.warn('⚠️ SLACK_BOT_TOKEN no configurado');
      return;
    }

    try {
      this.client = new WebClient(token);
      console.log('✅ Slack client inicializado correctamente');
      this.refreshChannelMap();
    } catch (error: any) {
      console.error('❌ Error inicializando Slack client:', error.message);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): WebClient {
    if (!this.client) {
      throw new Error('Slack client no está configurado');
    }
    return this.client;
  }

  async refreshChannelMap() {
    if (!this.isConfigured()) return;

    try {
      const result = await this.client!.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
      });

      if (result.channels) {
        this.channelMap.clear();
        result.channels.forEach((channel: any) => {
          if (channel.name) {
            this.channelMap.set(channel.name, channel.id);
          }
        });
        console.log(`✅ ${this.channelMap.size} canales de Slack mapeados`);
      }
    } catch (error: any) {
      if (error.data?.error !== 'invalid_auth' && error.data?.error !== 'account_inactive') {
        console.error('❌ Error refrescando canales:', error.message);
      }
    }
  }

  async sendMessage(channelName: string, text: string, username: string = 'SlackBoard'): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Slack no está configurado');
    }

    try {
      const channelId = this.channelMap.get(channelName);

      if (!channelId) {
        await this.refreshChannelMap();
        const newChannelId = this.channelMap.get(channelName);
        
        if (!newChannelId) {
          throw new Error(`Canal "${channelName}" no encontrado en Slack`);
        }
      }

      const result = await this.client!.chat.postMessage({
        channel: this.channelMap.get(channelName)!,
        text: text,
        username: username,
        icon_emoji: ':speech_balloon:',
      });

      return result;
    } catch (error: any) {
      console.error('❌ Error enviando mensaje a Slack:', error.message);
      throw error;
    }
  }

  async syncChannels(): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Slack no está configurado');
    }

    try {
      const result = await this.client!.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
      });

      return result.channels || [];
    } catch (error: any) {
      console.error('❌ Error sincronizando canales:', error.message);
      throw error;
    }
  }

  async getUserInfo(userId: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Slack no está configurado');
    }

    try {
      const result = await this.client!.users.info({ user: userId });
      return result.user;
    } catch (error: any) {
      console.error('❌ Error obteniendo info de usuario:', error.message);
      return null;
    }
  }
}

export default new SlackService();