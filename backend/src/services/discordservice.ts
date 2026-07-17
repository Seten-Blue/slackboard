import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  Message as DiscordMessage,
  TextChannel,
  DMChannel,
} from 'discord.js';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import Channel from '../models/Channel';
import MessageModel from '../models/Message';
import User from '../models/User';
import aiService from './aiService';
import mongoose from "mongoose";

dotenv.config();

const normalizeChannelName = (name: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

class discordService {
  private client: Client | null = null;
  private io: Server | null = null;
  private readonly token: string;
  private readonly guildIdFilter: string;
  private ready = false;

  constructor() {
    this.token = (process.env.DISCORD_BOT_TOKEN || '').trim();
    this.guildIdFilter = (process.env.DISCORD_GUILD_ID || '').trim();

    if (!this.token) {
      console.warn('⚠️  DISCORD_BOT_TOKEN no configurado. La integración con Discord no funcionará.');
    }
  }

  isConfigured(): boolean {
    return !!this.token && this.ready;
  }

  getClient(): Client {
    if (!this.client) throw new Error('Cliente de Discord no inicializado');
    return this.client;
  }

  /**
   * Se llama UNA vez desde index.ts (después de crear `io`), a diferencia de
   * Slack, que recibe eventos por webhook HTTP. Discord usa una conexión
   * persistente por WebSocket (gateway), así que el bot debe "loguearse" al
   * arrancar el servidor y se queda escuchando en segundo plano.
   */
  async connect(io: Server): Promise<void> {
    if (!this.token) return;
    this.io = io;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // privileged: debe activarse en el Developer Portal (pestaña Bot)
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction],
    });

    this.client.once('ready', () => {
      this.ready = true;
      console.log(`✅ Bot de Discord conectado como ${this.client?.user?.tag}`);
    });

    this.client.on('messageCreate', (message) =>
      this.handleMessageCreate(message).catch((err) =>
        console.error('❌ Error procesando mensaje de Discord:', err.message)
      )
    );

    this.client.on('messageUpdate', (_old, newMessage) =>
      this.handleMessageUpdate(newMessage as DiscordMessage).catch((err) =>
        console.error('❌ Error procesando edición de Discord:', err.message)
      )
    );

    this.client.on('messageDelete', (message) =>
      this.handleMessageDelete(message as DiscordMessage).catch((err) =>
        console.error('❌ Error procesando borrado de Discord:', err.message)
      )
    );

    this.client.on('messageReactionAdd', (reaction, user) =>
      this.handleReaction(reaction, user, 'add').catch((err) =>
        console.error('❌ Error procesando reacción de Discord:', err.message)
      )
    );

    this.client.on('messageReactionRemove', (reaction, user) =>
      this.handleReaction(reaction, user, 'remove').catch((err) =>
        console.error('❌ Error procesando remoción de reacción de Discord:', err.message)
      )
    );

    this.client.on('error', (err) => console.error('❌ Error del cliente de Discord:', err.message));

    await this.client.login(this.token);
  }

  private guildAllowed(guildId?: string | null): boolean {
    if (!this.guildIdFilter) return true;
    return guildId === this.guildIdFilter;
  }

  // ============ CANAL de Discord <-> Channel de SlackBoard ============
 private async resolveOrCreateDiscordChannel(
    discordChannel: TextChannel | DMChannel,
    guildName?: string,
    requestingUserId?: string
  ) {
    const isDM = discordChannel.type === ChannelType.DM;
    const discordChannelId = discordChannel.id;
    const rawName = isDM
      ? `DM con ${(discordChannel as DMChannel).recipient?.username || 'usuario'}`
      : `# ${(discordChannel as TextChannel).name}`;

    let channel: any = await Channel.findOne({ discordChannelId });
    if (channel) {
      if (!channel.displayName) {
        channel.displayName = rawName;
      }
      if (requestingUserId && !channel.members.some((m: any) => m.toString() === requestingUserId)) {
        channel.members.push(new mongoose.Types.ObjectId(requestingUserId));
      }
      await channel.save();
      return channel;
    }

    const fallbackName = isDM
      ? `discord-dm-${(discordChannel as DMChannel).recipient?.username || discordChannelId}`
      : normalizeChannelName(`${guildName || 'discord'}-${(discordChannel as TextChannel).name}`);

    const existingByName = await Channel.findOne({ name: fallbackName });
    if (existingByName) {
      if (!existingByName.discordChannelId) {
        existingByName.discordChannelId = discordChannelId;
        existingByName.platform = 'discord';
      }
      if (!existingByName.displayName) {
        existingByName.displayName = rawName;
      }
      if (
        requestingUserId &&
        !existingByName.members.some((m: any) => m.toString() === requestingUserId)
      ) {
        existingByName.members.push(new mongoose.Types.ObjectId(requestingUserId));
      }
      await existingByName.save();
      return existingByName;
    }

    const adminUser = (await User.findOne({ email: 'admin@slackboard.com' })) || (await User.findOne());
    if (!adminUser) {
      throw new Error('No existe un usuario admin para crear el canal sincronizado desde Discord');
    }

    const members: any[] = [adminUser._id];
    if (requestingUserId) {
      members.push(new mongoose.Types.ObjectId(requestingUserId));
    }

    channel = await Channel.create({
      name: fallbackName,
      displayName: rawName,
      description: isDM
        ? 'Mensaje directo de Discord'
        : `Canal sincronizado desde Discord (#${(discordChannel as TextChannel).name})`,
      isPrivate: isDM,
      platform: 'discord',
      members,
      createdBy: adminUser._id,
      discordChannelId,
    });

    console.log(`➕ Canal nuevo creado desde Discord: ${fallbackName} (${discordChannelId})`);
    return channel;
  }
  
  // ============ Autor de Discord <-> User de SlackBoard ============
  private async resolveOrCreateDiscordUser(author: {
    id: string;
    username: string;
    displayAvatarURL?: () => string;
  }) {
    const email = `discord_${author.id}@discord.local`;
    let user = await User.findOne({ email });
    if (user) return user;

    user = await User.create({
      email,
      username: author.username || `discord_${author.id}`,
      password: `discord_${author.id}`,
      avatar: author.displayAvatarURL ? author.displayAvatarURL() : undefined,
      status: 'online',
    });
    return user;
  }

  // ============ EVENTOS ENTRANTES ============
  private async handleMessageCreate(message: DiscordMessage) {
    // Ignora únicamente los mensajes que el propio bot envió (para no hacer loop);
    // SÍ acepta mensajes de otros bots/webhooks si eso es "cualquier comunicación".
    if (message.author.id === this.client?.user?.id) return;
    if (!this.guildAllowed(message.guildId)) return;

    const channelDoc = await this.resolveOrCreateDiscordChannel(
      message.channel as TextChannel | DMChannel,
      message.guild?.name
    );

    const user = await this.resolveOrCreateDiscordUser(message.author);

    const attachments = [...message.attachments.values()].map((a) => a.url);
    const firstEmbed = message.embeds[0];
    const content =
      message.content?.trim().length
        ? message.content
        : firstEmbed?.title || firstEmbed?.description || (attachments.length ? '📎 Adjunto' : '');

    if (!content && attachments.length === 0) return; // no hay nada guardable (ej. solo un sticker sin metadata)

    const created = await MessageModel.create({
      content,
      channel: channelDoc._id,
      sender: user._id,
      type: attachments.length ? 'file' : 'text',
      attachments,
      // ← usado para poder ubicar este mensaje si luego llega su edición/borrado/reacción
      discordMessageId: message.id,
    });

    const populated = await MessageModel.findById(created._id).populate(
      'sender',
      'username email avatar status'
    );

    if (this.io && populated) {
      this.io.to(channelDoc._id.toString()).emit('new-message', {
        channelId: channelDoc._id.toString(),
        message: populated,
      });
    }

    try {
      if (this.io) {
        await aiService.checkAndRespond({ text: content, channel: channelDoc, io: this.io });
      }
    } catch (aiError: any) {
      console.error('⚠️ Error disparando integración de IA desde Discord:', aiError.message);
    }
  }

  private async handleMessageUpdate(message: DiscordMessage) {
    if (!message?.id) return;
    const existing: any = await MessageModel.findOne({ discordMessageId: message.id });
    if (!existing) return;

    existing.content = message.content || existing.content;
    existing.isEdited = true;
    await existing.save();

    if (this.io) {
      this.io.to(existing.channel.toString()).emit('message-updated', {
        messageId: existing._id,
        content: existing.content,
      });
    }
  }

  private async handleMessageDelete(message: DiscordMessage) {
    if (!message?.id) return;
    const existing: any = await MessageModel.findOne({ discordMessageId: message.id });
    if (!existing) return;

    await MessageModel.findByIdAndDelete(existing._id);

    if (this.io) {
      this.io.to(existing.channel.toString()).emit('message-deleted', { messageId: existing._id });
    }
  }

  private async handleReaction(reaction: any, discordUser: any, action: 'add' | 'remove') {
    if (discordUser.bot) return;
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    const existing: any = await MessageModel.findOne({ discordMessageId: reaction.message.id });
    if (!existing) return;

    // Tus reacciones son {emoji, users: ObjectId[]} de TU User, no del id de
    // Discord directo, así que primero hay que resolver/crear el User.
    const mongoUser = await this.resolveOrCreateDiscordUser(discordUser);
    const emoji = reaction.emoji.name || reaction.emoji.toString();

    existing.reactions = existing.reactions || [];
    let entry = existing.reactions.find((r: any) => r.emoji === emoji);

    if (action === 'add') {
      if (!entry) {
        entry = { emoji, users: [] };
        existing.reactions.push(entry);
      }
      const mongoUserId = String(mongoUser._id);
      const alreadyReacted = entry.users.some((u: any) => u.toString() === mongoUserId);
      if (!alreadyReacted) entry.users.push(mongoUser._id);
    } else if (entry) {
      const mongoUserId = String(mongoUser._id);
      entry.users = entry.users.filter((u: any) => u.toString() !== mongoUserId);
      // si el emoji se queda sin usuarios, se elimina la entrada completa
      existing.reactions = existing.reactions.filter((r: any) => r.users.length > 0);
    }

    await existing.save();

    if (this.io) {
      this.io.to(existing.channel.toString()).emit('message-reaction', {
        messageId: existing._id,
        reactions: existing.reactions,
      });
    }
  }

  // ============ SALIDA: SlackBoard -> Discord ============
  async sendMessage(internalChannelId: string, text: string): Promise<void> {
    if (!this.isConfigured()) {
      console.log('Discord no configurado, mensaje solo local:', { internalChannelId, text });
      return;
    }

    const channelDoc: any = await Channel.findById(internalChannelId);
    if (!channelDoc?.discordChannelId) {
      throw new Error('Este canal no está vinculado con un canal de Discord.');
    }

    const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
    if (!discordChannel || !discordChannel.isTextBased()) {
      throw new Error('El canal de Discord vinculado ya no existe o no admite mensajes de texto.');
    }

    await (discordChannel as TextChannel).send(text);
  }

  // ============ SINCRONIZACIÓN: traer canales existentes del/los servidor(es) ============
  async syncGuildChannels(requestingUserId?: string): Promise<any[]> {
    if (!this.isConfigured()) return [];

    const synced: any[] = [];
    for (const [, guild] of this.getClient().guilds.cache) {
      if (!this.guildAllowed(guild.id)) continue;

      const channels = await guild.channels.fetch();
      for (const [, ch] of channels) {
        if (!ch || ch.type !== ChannelType.GuildText) continue;
        const channelDoc = await this.resolveOrCreateDiscordChannel(ch as TextChannel, guild.name, requestingUserId);
        synced.push(channelDoc);
      
          }


          
    }
    return synced;
  
    
  }
  isBotInGuild(guildId: string): boolean {
    if (!this.client) return false;
    return this.client.guilds.cache.has(guildId);
  }

  async syncSpecificGuild(guildId: string, requestingUserId?: string): Promise<any[]> {
    if (!this.isConfigured()) return [];

    const guild = this.getClient().guilds.cache.get(guildId);
    if (!guild) {
      throw new Error('El bot no pertenece a ese servidor.');
    }

    const synced: any[] = [];
    const channels = await guild.channels.fetch();
    for (const [, ch] of channels) {
      if (!ch || ch.type !== ChannelType.GuildText) continue;
      const channelDoc = await this.resolveOrCreateDiscordChannel(ch as TextChannel, guild.name, requestingUserId);
      synced.push(channelDoc);
    }
    return synced;
  }
}

export default new discordService();