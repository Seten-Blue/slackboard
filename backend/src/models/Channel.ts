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
  platform: ChannelPlatform;
  aiEnabled?: boolean;
  isAIChannel?: boolean;
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
    // ← NUEVO: equivalente a slackChannelId pero para Discord.
    // Permite: (1) reconocer un canal que ya vinculamos antes,
    // (2) mandar mensajes de vuelta al canal correcto de Discord.
    discordChannelId: {
      type: String,
      default: null,
      index: true,
    },
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
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IChannel>('Channel', ChannelSchema);