import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  Message as DiscordMessage,
  TextChannel,
  DMChannel,
  Webhook,
  Routes,
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
      console.warn('⚠️  DISCORD_BOT_TOKEN no configurado. La integracion con Discord no funcionara.');
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
   * Se llama UNA vez desde index.ts (despues de crear `io`), a diferencia de
   * Slack, que recibe eventos por webhook HTTP. Discord usa una conexion
   * persistente por WebSocket (gateway), asi que el bot debe "loguearse" al
   * arrancar el servidor y se queda escuchando en segundo plano.
   */
  async connect(io: Server): Promise<void> {
    if (!this.token) return;
    this.io = io;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // privileged: debe activarse en el Developer Portal (pestana Bot)
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessagePolls,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.Reaction],
    });

    this.client.once('clientReady', () => {
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
        console.error('❌ Error procesando edicion de Discord:', err.message)
      )
    );

    this.client.on('messageDelete', (message) =>
      this.handleMessageDelete(message as DiscordMessage).catch((err) =>
        console.error('❌ Error procesando borrado de Discord:', err.message)
      )
    );

    this.client.on('messageReactionAdd', (reaction, user) =>
      this.handleReaction(reaction, user, 'add').catch((err) =>
        console.error('❌ Error procesando reaccion de Discord:', err.message)
      )
    );

    this.client.on('messageReactionRemove', (reaction, user) =>
      this.handleReaction(reaction, user, 'remove').catch((err) =>
        console.error('❌ Error procesando remocion de reaccion de Discord:', err.message)
      )
    );

    // Poll votes: use raw event because messagePollVoteAdd doesn't include message_id
    this.client.on('raw' as any, (packet: any) => {
      if (packet.t === 'MESSAGE_POLL_VOTE_ADD') {
        this.handlePollVoteRaw(packet.d, 'add').catch((err: any) =>
          console.error('❌ Error procesando voto de poll de Discord:', err.message)
        );
      } else if (packet.t === 'MESSAGE_POLL_VOTE_REMOVE') {
        this.handlePollVoteRaw(packet.d, 'remove').catch((err: any) =>
          console.error('❌ Error procesando remoción de voto de poll de Discord:', err.message)
        );
      }
    });

    this.client.on('threadCreate', (thread) =>
      this.handleThreadCreate(thread).catch((err) =>
        console.error('❌ Error procesando creacion de thread:', err.message)
      )
    );

    this.client.on('threadUpdate', (_oldThread, newThread) =>
      this.handleThreadUpdate(newThread).catch((err) =>
        console.error('❌ Error procesando actualizacion de thread:', err.message)
      )
    );

    this.client.on('threadDelete', (thread) =>
      this.handleThreadDelete(thread).catch((err) =>
        console.error('❌ Error procesando borrado de thread:', err.message)
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

    user = await User.findOne({ username: author.username });
    if (user) {
      user.discordUserId = author.id;
      user.discordUsername = author.username;
      user.discordAvatar = author.displayAvatarURL ? author.displayAvatarURL() : undefined;
      await user.save();
      return user;
    }

    try {
      user = await User.create({
        email,
        username: author.username || `discord_${author.id}`,
        password: `discord_${author.id}`,
        avatar: author.displayAvatarURL ? author.displayAvatarURL() : undefined,
        status: 'online',
      });
      return user;
    } catch (createErr: any) {
      if (createErr.code === 11000) {
        user = await User.findOne({ email });
        if (user) return user;
      }
      throw createErr;
    }
  }

  // ============ EVENTOS ENTRANTES ============
  private async handleMessageCreate(message: DiscordMessage) {
    // Ignora unicamente los mensajes que el propio bot envio (para no hacer loop);
    // SÍ acepta mensajes de otros bots/webhooks si eso es "cualquier comunicacion".
    if (message.author.id === this.client?.user?.id) return;
    if (!this.guildAllowed(message.guildId)) return;

    const user = await this.resolveOrCreateDiscordUser(message.author);

    const attachments = [...message.attachments.values()].map((a) => a.url);
    const firstEmbed = message.embeds[0];
    const content =
      message.content?.trim().length
        ? message.content
        : firstEmbed?.title || firstEmbed?.description || (attachments.length ? '📎 Adjunto' : '');

    if (!content && attachments.length === 0) {
      console.log(`[DiscordService] Mensaje descartado — sin contenido guardable (guild=${message.guildId}, channel=${message.channelId}, author=${message.author?.id}, messageId=${message.id})`);
      return;
    }

    // Verificar si el mensaje es una respuesta dentro de un thread de Discord
    // Usamos channelId para buscar el thread en la cache de Discord en vez de
    // confiar en message.channel que puede ser partial.
    const threadTypes = [
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
      ChannelType.AnnouncementThread,
    ];

    let isThread = false;
    let threadId = message.channelId;
    try {
      const fetchedChannel = await this.getClient().channels.fetch(message.channelId);
      if (fetchedChannel && threadTypes.includes((fetchedChannel as any).type)) {
        isThread = true;
        threadId = fetchedChannel.id;
      }
    } catch {
      // Si no se puede fetch, intentar con el tipo del channel en cache
      if (message.channel && typeof (message.channel as any).type === 'number' && threadTypes.includes((message.channel as any).type)) {
        isThread = true;
      }
    }

    if (isThread) {
      console.log(`[DiscordService] Mensaje en thread detectado: threadId=${threadId}, author=${message.author.id}`);
      // Buscar el mensaje padre en SlackBoard por discordThreadId
      const parentMessage: any = await MessageModel.findOne({ discordThreadId: threadId });
      if (!parentMessage) {
        console.log(`[DiscordService] Thread ${threadId} no tiene mensaje padre en SlackBoard, ignorando reply`);
        return;
      }

      const reply = await MessageModel.create({
        content,
        channel: parentMessage.channel,
        sender: user._id,
        type: attachments.length ? 'file' : 'text',
        attachments,
        threadParent: parentMessage._id,
        discordMessageId: message.id,
      });

      // Actualizar replyCount y participantes
      const threadData = (parentMessage.threadData as any) || {};
      threadData.replyCount = (threadData.replyCount || 0) + 1;
      if (!threadData.participants) threadData.participants = [];
      if (!threadData.participants.includes(user._id)) {
        threadData.participants.push(user._id);
      }
      parentMessage.threadData = threadData;
      await parentMessage.save();

      const populated = await MessageModel.findById(reply._id).populate(
        'sender', 'username email avatar status'
      );

      if (this.io && populated) {
        this.io.to(parentMessage.channel.toString()).emit('thread:reply', {
          parentMessageId: parentMessage._id,
          reply: populated,
        });
      }
      return;
    }

    const channelDoc = await this.resolveOrCreateDiscordChannel(
      message.channel as TextChannel | DMChannel,
      message.guild?.name
    );

    const created = await MessageModel.create({
      content,
      channel: channelDoc._id,
      sender: user._id,
      type: attachments.length ? 'file' : 'text',
      attachments,
      // ← usado para poder ubicar este mensaje si luego llega su edicion/borrado/reaccion
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
      console.error('⚠️ Error disparando integracion de IA desde Discord:', aiError.message);
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

    // Skip poll messages — poll votes are handled by handlePollVote
    if (existing.type === 'poll') return;

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

  // ============ POLL VOTES: Sincronización desde Discord nativo ============

  // Raw gateway payload: { user_id, message_id, answer_id, channel_id, guild_id }
  private async handlePollVoteRaw(data: any, action: 'add' | 'remove') {
    if (!data) return;

    const userId = data.user_id;
    const messageId = data.message_id;
    const answerId = String(data.answer_id || '');
    if (!userId || !messageId || !answerId) {
      console.log(`[DiscordService] Poll vote raw: missing data`, data);
      return;
    }

    // Ignore bot votes
    const discordUserObj = await this.getClient().users.fetch(userId).catch(() => null);
    if (!discordUserObj || discordUserObj.bot) return;

    const existing: any = await MessageModel.findOne({ discordMessageId: messageId });
    if (!existing || existing.type !== 'poll' || !existing.pollData) {
      console.log(`[DiscordService] Poll vote ${action}: message ${messageId} not found or not a poll`);
      return;
    }

    const mongoUser = await this.resolveOrCreateDiscordUser(discordUserObj);
    const mongoUserId = String(mongoUser._id);
    const pollData = existing.pollData as any;

    // Map Discord answer_id to option index
    let optionIndex = -1;

    if (pollData.discordAnswerIds && Array.isArray(pollData.discordAnswerIds)) {
      optionIndex = pollData.discordAnswerIds.indexOf(answerId);
    }

    // Fallback: Discord answer_ids start at 1
    if (optionIndex === -1) {
      const numericId = parseInt(answerId, 10);
      if (!isNaN(numericId) && numericId >= 1 && numericId <= pollData.options.length) {
        optionIndex = numericId - 1;
      }
    }

    if (optionIndex === -1 || optionIndex >= pollData.options.length) {
      console.log(`[DiscordService] Poll vote ${action}: could not map answer_id=${answerId} to option`);
      return;
    }

    const option = pollData.options[optionIndex];

    if (action === 'add') {
      if (pollData.allowMultiple) {
        const alreadyVoted = option.voters.some((v: any) => v.toString() === mongoUserId);
        if (!alreadyVoted) option.voters.push(mongoUser._id);
      } else {
        for (const opt of pollData.options) {
          const idx = opt.voters.findIndex((v: any) => v.toString() === mongoUserId);
          if (idx !== -1) opt.voters.splice(idx, 1);
        }
        const alreadyVoted = option.voters.some((v: any) => v.toString() === mongoUserId);
        if (!alreadyVoted) option.voters.push(mongoUser._id);
      }
    } else {
      option.voters = option.voters.filter((v: any) => v.toString() !== mongoUserId);
    }

    existing.markModified('pollData');
    await existing.save();

    if (this.io) {
      this.io.to(existing.channel.toString()).emit('poll-voted', {
        messageId: existing._id,
        pollData: existing.pollData,
      });
    }

    console.log(`[DiscordService] Poll vote ${action}: user=${mongoUserId}, option=${optionIndex} ("${option.text}"), question="${pollData.question}"`);
  }

  // ============ THREADS: Sincronización desde Discord ============

  private async handleThreadCreate(thread: any) {
    if (!this.guildAllowed(thread.guildId)) return;

    // Si el thread fue creado por el propio bot (desde SlackBoard), ignorar —
    // el controller ya está guardando el discordThreadId en el Message original.
    if (thread.ownerId === this.client?.user?.id) {
      console.log(`[DiscordService] Thread creado por el bot (${thread.id}), ignorando handleThreadCreate`);
      return;
    }

    // Buscar si el thread padre ya tiene un mensaje raíz en SlackBoard
    const parentChannel = thread.parent;
    if (!parentChannel) return;

    const channelDoc = await this.resolveOrCreateDiscordChannel(
      parentChannel as TextChannel,
      thread.guild?.name,
    );
    if (!channelDoc) return;

    // Verificar si ya existe un mensaje de tipo thread con este discordThreadId
    const existing = await MessageModel.findOne({ discordThreadId: thread.id });
    if (existing) return;

    // Crear el mensaje raíz del thread en SlackBoard
    const botUser = await this.resolveOrCreateDiscordUser({
      id: this.client?.user?.id || 'bot',
      username: this.client?.user?.username || 'SlackBoard Bot',
      displayAvatarURL: this.client?.user?.displayAvatarURL?.bind(this.client.user),
    });

    const created = await MessageModel.create({
      content: `💬 ${thread.name}`,
      channel: channelDoc._id,
      sender: botUser._id,
      type: 'thread',
      threadData: {
        title: thread.name,
        initialMessage: '',
        discordThreadId: thread.id,
        replyCount: 0,
        isArchived: false,
        participants: [],
      },
      discordThreadId: thread.id,
    });

    if (this.io) {
      this.io.to(channelDoc._id.toString()).emit('new-message', {
        channelId: channelDoc._id.toString(),
        message: await MessageModel.findById(created._id).populate('sender', 'username email avatar status'),
      });
    }

    console.log(`[DiscordService] Thread sincronizado desde Discord: ${thread.id} → ${created._id}`);
  }

  private async handleThreadUpdate(newThread: any) {
    const existing: any = await MessageModel.findOne({ discordThreadId: newThread.id });
    if (!existing) return;

    const threadData = (existing.threadData as any) || {};
    threadData.isArchived = newThread.archived || false;
    if (newThread.name) threadData.title = newThread.name;
    existing.threadData = threadData;
    await existing.save();

    if (this.io) {
      this.io.to(existing.channel.toString()).emit('thread-updated', {
        messageId: existing._id,
        threadData: existing.threadData,
      });
    }
  }

  private async handleThreadDelete(thread: any) {
    const existing: any = await MessageModel.findOne({ discordThreadId: thread.id });
    if (!existing) return;

    const threadData = (existing.threadData as any) || {};
    threadData.isArchived = true;
    existing.threadData = threadData;
    await existing.save();

    if (this.io) {
      this.io.to(existing.channel.toString()).emit('thread-deleted', {
        messageId: existing._id,
      });
    }
  }

  // ============ SALIDA: SlackBoard -> Discord ============

  private buildPollFallbackText(pollData: any): string {
    const durationHours = Math.min(Math.max(pollData.duration || 24, 1), 768);
    const lines = [
      `📊 **${pollData.question || 'Encuesta'}**`,
      '',
      ...(pollData.options || []).map((opt: any, i: number) => {
        const emoji = (opt.emoji || '').trim();
        const text = (opt.text || '').trim() || `Opcion ${i + 1}`;
        return `${emoji ? emoji + ' ' : ''}${text}`;
      }),
      '',
      `⏱ ${durationHours}h`,
      pollData.allowMultiple ? '☑ Multiples respuestas' : '',
      pollData.isAnonymous ? '🔒 Anonima' : '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  private async getOrCreateWebhook(channelDoc: any): Promise<Webhook | null> {
    if (!channelDoc.discordChannelId) {
      console.warn('⚠️ Webhook: canal Discord no vinculado (discordChannelId vacío)');
      return null;
    }

    if (channelDoc.discordWebhookId && channelDoc.discordWebhookToken) {
      try {
        const webhook = await this.getClient().fetchWebhook(channelDoc.discordWebhookId, channelDoc.discordWebhookToken);
        if (webhook) return webhook;
      } catch (fetchErr: any) {
        console.warn(`⚠️ Webhook existente inválido (id: ${channelDoc.discordWebhookId}), creando uno nuevo:`, fetchErr.message);
        channelDoc.discordWebhookId = null;
        channelDoc.discordWebhookToken = null;
      }
    }

    try {
      const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
      if (!discordChannel || !discordChannel.isTextBased()) {
        console.warn(`⚠️ Webhook: canal de Discord ${channelDoc.discordChannelId} no encontrado o no es de texto`);
        return null;
      }

      const webhook = await (discordChannel as TextChannel).createWebhook({
        name: 'SlackBoard',
        reason: 'Para enviar mensajes con el nombre real del usuario',
      });

      channelDoc.discordWebhookId = webhook.id;
      channelDoc.discordWebhookToken = webhook.token!;
      await channelDoc.save();

      console.log(`✅ Webhook creado en canal ${channelDoc.discordChannelId}: ${webhook.id}`);
      return webhook;
    } catch (err: any) {
      const status = err.httpStatus || err.status || 'desconocido';
      const code = err.code || 'sin código';
      console.error(`❌ No se pudo crear webhook de Discord [HTTP ${status}, code: ${code}]:`, err.message);
      if (status === 403) {
        console.error('   → El bot no tiene permiso MANAGE_WEBHOOKS en este canal. Re-invita el bot con permisos actualizados.');
      }
      return null;
    }
  }

  async sendMessage(
    internalChannelId: string,
    text: string,
    senderUsername?: string,
    senderAvatar?: string,
    attachments?: string[],
  ): Promise<string | null> {
    if (!this.isConfigured()) {
      console.log('Discord no configurado, mensaje solo local:', { internalChannelId, text });
      return null;
    }

    const channelDoc: any = await Channel.findById(internalChannelId);
    if (!channelDoc?.discordChannelId) {
      throw new Error('Este canal no esta vinculado con un canal de Discord.');
    }

    const webhook = senderUsername ? await this.getOrCreateWebhook(channelDoc) : null;

    if (webhook) {
      if (attachments && attachments.length > 0) {
        const sent = await webhook.send({
          content: text,
          files: attachments,
          username: senderUsername,
          avatarURL: senderAvatar || undefined,
        });
        return sent.id;
      }
      const sent = await webhook.send({
        content: text,
        username: senderUsername,
        avatarURL: senderAvatar || undefined,
      });
      return sent.id;
    }

    console.warn(`⚠️ Webhook no disponible para canal ${channelDoc.discordChannelId}, enviando como bot (${senderUsername || 'sin usuario'})`);
    const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
    if (!discordChannel || !discordChannel.isTextBased()) {
      throw new Error('El canal de Discord vinculado ya no existe o no admite mensajes de texto.');
    }

    if (attachments && attachments.length > 0) {
      const sent = await (discordChannel as TextChannel).send({ content: text, files: attachments });
      return sent.id;
    }
    const sent = await (discordChannel as TextChannel).send(text);
    return sent.id;
  }

  async sendStructuredMessage(
    internalChannelId: string,
    senderUsername: string,
    senderAvatar: string | undefined,
    pollData: any,
    threadData: any,
  ): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const channelDoc: any = await Channel.findById(internalChannelId);
    if (!channelDoc?.discordChannelId) return null;

    const webhook = await this.getOrCreateWebhook(channelDoc);

    if (pollData) {
      const answers = (pollData.options || [])
        .filter((opt: any) => (opt.text || '').trim().length > 0 || (opt.emoji || '').trim().length > 0)
        .map((opt: any) => {
          const text = (opt.text || '').trim() || (opt.emoji || '').trim() || 'Opcion';
          const pollMedia: any = { text };
          if (opt.emoji && opt.emoji.trim()) {
            pollMedia.emoji = { name: opt.emoji.trim() };
          }
          return { poll_media: pollMedia };
        });

      if (answers.length < 2) {
        console.warn('⚠️ Poll con menos de 2 respuestas válidas, enviando como embed');
        const fallbackText = this.buildPollFallbackText(pollData);
        if (webhook) {
          const sent = await webhook.send({ content: fallbackText, username: senderUsername, avatarURL: senderAvatar || undefined });
          return sent.id;
        }
        const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
        if (!discordChannel || !discordChannel.isTextBased()) return null;
        const sent = await (discordChannel as TextChannel).send(fallbackText);
        return sent.id;
      }

      const durationHours = Math.min(Math.max(pollData.duration || 24, 1), 768);

      try {
        const body: any = {
          content: '',
          poll: {
            question: { text: (pollData.question || 'Encuesta').trim() },
            answers,
            duration: durationHours,
            allow_multiselect: pollData.allowMultiple || false,
            layout_type: 1,
          },
        };

        const sent = await this.getClient().rest.post(
          Routes.channelMessages(channelDoc.discordChannelId),
          { body },
        ) as any;

        // Store Discord answer IDs for mapping poll votes back to option indices
        if (sent?.poll?.answers && sent.poll.answers.length > 0) {
          const answerIdMap: string[] = sent.poll.answers.map((a: any) => String(a.answer_id || a.id));
          const channelMsg = await MessageModel.findOne({
            channel: internalChannelId,
            type: 'poll',
            'pollData.question': pollData.question,
          }).sort({ createdAt: -1 });
          if (channelMsg) {
            (channelMsg.pollData as any).discordAnswerIds = answerIdMap;
            channelMsg.markModified('pollData');
            await channelMsg.save();
          }
        }

        return sent.id;
      } catch (pollErr: any) {
        console.warn(`⚠️ No se pudo enviar poll nativo de Discord (${pollErr.message}), enviando como embed`);
        const fallbackText = this.buildPollFallbackText(pollData);
        if (webhook) {
          const sent = await webhook.send({ content: fallbackText, username: senderUsername, avatarURL: senderAvatar || undefined });
          return sent.id;
        }
        const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
        if (!discordChannel || !discordChannel.isTextBased()) return null;
        const sent = await (discordChannel as TextChannel).send(fallbackText);
        return sent.id;
      }
    }

    if (threadData) {
      const embed = {
        title: `💬 ${threadData.title}`,
        description: threadData.initialMessage || '*Hilo de conversacion*',
        color: 0x6366f1,
        footer: { text: 'Hilo de conversacion abierto desde SlackBoard' },
        timestamp: new Date().toISOString(),
      };

      const payload: any = {
        content: '',
        username: senderUsername,
        avatarURL: senderAvatar || undefined,
        embeds: [embed],
      };

      let sentMessage;
      if (webhook) {
        sentMessage = await webhook.send(payload);
      } else {
        const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
        if (!discordChannel || !discordChannel.isTextBased()) return null;
        sentMessage = await (discordChannel as TextChannel).send(payload);
      }

      // Crear thread real en Discord a partir del mensaje enviado
      try {
        const thread = await sentMessage.startThread({
          name: `💬 ${threadData.title}`,
          autoArchiveDuration: 1440, // 24h
        });
        console.log(`[DiscordService] Thread creado: ${thread.id} en canal ${channelDoc.discordChannelId}`);
        return thread.id;
      } catch (err) {
        console.error(`[DiscordService] Error creando thread en Discord:`, err);
        return sentMessage.id;
      }
    }

    return null;
  }

  private async fetchDiscordMessage(internalChannelId: string, discordMessageId: string) {
    const channelDoc: any = await Channel.findById(internalChannelId);
    if (!channelDoc?.discordChannelId) return null;

    const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
    if (!discordChannel || !discordChannel.isTextBased()) return null;

    return (discordChannel as TextChannel).messages.fetch(discordMessageId);
  }

  async editMessage(internalChannelId: string, discordMessageId: string, newContent: string): Promise<void> {
    if (!this.isConfigured()) return;
    const message = await this.fetchDiscordMessage(internalChannelId, discordMessageId);
    if (message) await message.edit(newContent);
  }

  async sendReplyToThread(
    internalChannelId: string,
    discordThreadId: string,
    content: string,
    senderUsername: string,
    senderAvatar: string | undefined,
    attachments: string[],
  ): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      const channelDoc: any = await Channel.findById(internalChannelId);
      if (!channelDoc?.discordChannelId) return;

      const discordChannel = await this.getClient().channels.fetch(channelDoc.discordChannelId);
      if (!discordChannel || !discordChannel.isTextBased()) return;

      // Fetch the thread from the channel
      const thread = await (discordChannel as TextChannel).threads.fetch(discordThreadId);
      if (!thread) {
        console.log(`[DiscordService] Thread ${discordThreadId} no encontrado`);
        return;
      }

      const payload: any = {
        content: content || undefined,
        username: senderUsername,
        avatarURL: senderAvatar || undefined,
      };

      if (attachments.length > 0) {
        payload.files = attachments;
      }

      await thread.send(payload);
    } catch (err) {
      console.error(`[DiscordService] Error enviando reply a thread ${discordThreadId}:`, err);
    }
  }

  async deleteMessageById(internalChannelId: string, discordMessageId: string): Promise<void> {
    if (!this.isConfigured()) return;
    const message = await this.fetchDiscordMessage(internalChannelId, discordMessageId);
    if (message) await message.delete();
  }

  async addReactionToMessage(internalChannelId: string, discordMessageId: string, emoji: string): Promise<void> {
    if (!this.isConfigured()) return;
    const message = await this.fetchDiscordMessage(internalChannelId, discordMessageId);
    if (message) await message.react(emoji);
  }

  async removeReactionFromMessage(internalChannelId: string, discordMessageId: string, emoji: string): Promise<void> {
    if (!this.isConfigured()) return;
    const message = await this.fetchDiscordMessage(internalChannelId, discordMessageId);
    if (!message) return;

    const reaction = message.reactions.cache.find(
      (r) => r.emoji.name === emoji || r.emoji.toString() === emoji
    );
    if (reaction) {
      await reaction.users.remove(this.getClient().user!.id);
    }
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

  async createChannel(name: string, isPrivate: boolean = false): Promise<{ channelId: string; name: string }> {
    if (!this.isConfigured()) {
      throw new Error('Discord no esta configurado');
    }

    const normalized = normalizeChannelName(name);

    let guild = null;
    if (this.guildIdFilter) {
      guild = this.getClient().guilds.cache.get(this.guildIdFilter);
    }
    if (!guild) {
      const guilds = this.getClient().guilds.cache;
      if (guilds.size > 0) {
        guild = guilds.first();
      }
    }

    if (!guild) {
      throw new Error('El bot no esta en ningun servidor de Discord');
    }

    try {
      const channel = await guild.channels.create({
        name: normalized,
        type: ChannelType.GuildText,
        topic: `Canal creado desde SlackBoard`,
      });

      console.log(`Canal creado en Discord: ${normalized} -> ${channel.id}`);

      return { channelId: channel.id, name: normalized };
    } catch (error: any) {
      console.error('Error creando canal en Discord:', error.message);
      throw new Error(`Error creando canal en Discord: ${error.message}`);
    }
  }
}

export default new discordService();