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

  async sendMessage(channelName: string, text: string, username?: string, attachments?: string[]): Promise<any> {
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
        const senderPrefix = username ? `*${username}*: ` : '';
        const attachmentSuffix = attachments && attachments.length > 0
          ? '\n' + attachments.map((url) => `📎 ${url}`).join('\n')
          : '';
        const result = await this.client.chat.postMessage({
          channel: slackChannelId,
          text: senderPrefix + text + attachmentSuffix,
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

            const senderPrefix = username ? `*${username}*: ` : '';
            const retryAttachmentSuffix = attachments && attachments.length > 0
              ? '\n' + attachments.map((url) => `📎 ${url}`).join('\n')
              : '';
            const retryResult = await this.client.chat.postMessage({
              channel: slackChannelId,
              text: senderPrefix + text + retryAttachmentSuffix,
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

      console.log(`Bot salio del canal ${channelId}`);

      return result;

    } catch (error: any) {
      console.error('Error abandonando el canal en Slack:', error.message);
      throw error;
    }
  }

  async createChannel(name: string, isPrivate: boolean = false): Promise<{ channelId: string; name: string }> {
    if (!this.isConfigured()) {
      throw new Error('Slack no esta configurado');
    }

    const normalizedName = this.normalizeChannelName(name);

    try {
      const result = await this.client.conversations.create({
        name: normalizedName,
        is_private: isPrivate,
      });

      const channelId = (result as any).channel?.id;
      if (!channelId) {
        throw new Error('No se obtuvo el ID del canal creado');
      }

      this.channelMap.set(normalizedName, channelId);
      this.channelMap.set(name.toLowerCase(), channelId);

      console.log(`Canal creado en Slack: ${normalizedName} -> ${channelId}`);

      try {
        await this.client.conversations.join({ channel: channelId });
      } catch (joinErr: any) {
        console.warn('Advertencia: no se pudo unir el bot al canal creado:', joinErr.message);
      }

      return { channelId, name: normalizedName };
    } catch (error: any) {
      const msg = error?.data?.error || error.message;
      console.error('Error creando canal en Slack:', msg);
      throw new Error(`Error creando canal en Slack: ${msg}`);
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

  // ========== Polls: enviar encuesta en texto plano a Slack ==========
  async sendPollMessage(channelName: string, pollData: any, username?: string): Promise<string | null> {
    if (!this.isConfigured() || !pollData) return null;

    const normalizedChannelName = this.normalizeChannelName(channelName);
    let slackChannelId = this.channelMap.get(normalizedChannelName) || this.channelMap.get(channelName.toLowerCase());
    if (!slackChannelId) {
      await this.initializeChannelMap();
      slackChannelId = this.channelMap.get(normalizedChannelName) || this.channelMap.get(channelName.toLowerCase());
    }
    if (!slackChannelId) return null;

    const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    const optionLines = (pollData.options || [])
      .map((opt: any, i: number) => {
        const emoji = NUM_EMOJIS[i] || `${i + 1}\uFE0F\u20E3`;
        const text = (opt.text || '').trim() || `Opcion ${i + 1}`;
        return `${emoji} ${text}`;
      })
      .join('\n');

    const lines = [
      `📊 ${pollData.question || 'Encuesta'}`,
      '',
      optionLines,
      '',
    ];

    if (pollData.allowMultiple) lines.push('☑ Multiple respuesta');
    if (pollData.isAnonymous) lines.push('🔒 Anonima');
    if (pollData.duration) lines.push(`⏱ ${pollData.duration}h`);

    lines.push('', 'Reacciona con el numero de tu opcion para votar');

    const text = lines.join('\n');

    try {
      const result = await this.client.chat.postMessage({
        channel: slackChannelId,
        text,
        username: username || 'SlackBoard Bot',
        icon_emoji: ':robot_face:',
      });
      console.log(`✅ Encuesta enviada a Slack: ${result.ts}`);
      return result.ts || null;
    } catch (error: any) {
      console.error('❌ Error enviando encuesta a Slack:', error.message);
      return null;
    }
  }

  // ========== Reacciones en Slack ==========
  async addReactionToSlackMessage(slackChannelId: string, slackMessageTs: string, emoji: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.client.reactions.add({
        channel: slackChannelId,
        timestamp: slackMessageTs,
        name: emoji,
      });
    } catch (error: any) {
      if (error?.data?.error === 'already_reacted') return;
      console.error('❌ Error agregando reacción en Slack:', error.message);
    }
  }

  async removeReactionFromSlackMessage(slackChannelId: string, slackMessageTs: string, emoji: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.client.reactions.remove({
        channel: slackChannelId,
        timestamp: slackMessageTs,
        name: emoji,
      });
    } catch (error: any) {
      if (error?.data?.error === 'no_reaction') return;
      console.error('❌ Error removiendo reacción de Slack:', error.message);
    }
  }

  async resolveChannelIdByName(channelName: string): Promise<string | null> {
    const normalized = this.normalizeChannelName(channelName);
    let id = this.channelMap.get(normalized) || this.channelMap.get(channelName.toLowerCase());
    if (!id) {
      await this.initializeChannelMap();
      id = this.channelMap.get(normalized) || this.channelMap.get(channelName.toLowerCase());
    }
    return id || null;
  }

  // ========== Friend Request DMs ==========
  async sendFriendRequestDM(
    toEmail: string,
    fromUsername: string,
    friendshipId: string,
  ): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      const userRes = await this.client.users.lookupByEmail({ email: toEmail });
      if (!userRes?.ok || !userRes.user?.id) {
        console.warn(`[SlackService] No se pudo resolver email ${toEmail} a Slack user ID`);
        return;
      }
      const slackUserId = userRes.user.id;

      const result = await this.client.chat.postMessage({
        channel: slackUserId,
        text: `👤 *${fromUsername}* te envio una solicitud de amistad en SlackBoard.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👤 *${fromUsername}* te envio una solicitud de amistad en SlackBoard.`,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Aceptar', emoji: true },
                style: 'primary',
                action_id: `friend_accept:${friendshipId}`,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Rechazar', emoji: true },
                style: 'danger',
                action_id: `friend_reject:${friendshipId}`,
              },
            ],
          },
        ],
      });
      console.log(`[SlackService] Friend request DM sent to ${slackUserId} (from ${toEmail}) from ${fromUsername}`);
    } catch (err: any) {
      console.warn(`[SlackService] No se pudo enviar DM de friend request a ${toEmail}:`, err.message);
    }
  }

  async sendFriendAcceptedDM(
    toEmail: string,
    acceptedByUsername: string,
  ): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      const userRes = await this.client.users.lookupByEmail({ email: toEmail });
      if (!userRes?.ok || !userRes.user?.id) {
        console.warn(`[SlackService] No se pudo resolver email ${toEmail} a Slack user ID`);
        return;
      }
      const slackUserId = userRes.user.id;

      await this.client.chat.postMessage({
        channel: slackUserId,
        text: `✅ *${acceptedByUsername}* acepto tu solicitud de amistad en SlackBoard. Ya son amigos!`,
      });
    } catch (err: any) {
      console.warn(`[SlackService] No se pudo enviar DM de friend accepted a ${toEmail}:`, err.message);
    }
  }

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