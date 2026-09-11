import mongoose, { Document, Schema } from 'mongoose';

export type ChannelPlatform = 'slack' | 'whatsapp' | 'discord' | 'skype' | 'teams' | 'other';

export interface IChannel extends Document {
  name: string;
  description?: string;
  isPrivate: boolean;
  members: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  slackChannelId?: string;
  discordChannelId?: string;
  discordGuildId?: string;
  discordGuildName?: string;
  discordWebhookId?: string;
  discordWebhookToken?: string;
  slackTeamId?: string;
  whatsappPhone?: string;
  displayName?: string;
  platform: ChannelPlatform;
  aiEnabled?: boolean;
  isAIChannel?: boolean;
  readUntil?: Map<string, Date>;
  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    slackChannelId: {
      type: String,
      default: null,
      index: true,
    },
    discordChannelId: {
      type: String,
      default: null,
      index: true,
    },
    discordGuildId: { type: String, default: null, index: true },
    discordGuildName: { type: String, default: null },
    discordWebhookId: { type: String, default: null },
    discordWebhookToken: { type: String, default: null },
    slackTeamId: { type: String, default: null, index: true },
    whatsappPhone: { type: String, default: null, index: true },
    displayName: { type: String, default: null },
    platform: {
      type: String,
      enum: ['slack', 'whatsapp', 'discord', 'skype', 'teams', 'other'],
      default: 'slack',
      index: true,
    },
    aiEnabled: {
      type: Boolean,
      default: true,
    },
    isAIChannel: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Marcas de "leido hasta" por usuario para calcular no leidos por canal
    readUntil: {
      type: Map,
      of: Date,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IChannel>('Channel', ChannelSchema);