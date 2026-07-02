import mongoose, { Document, Schema } from 'mongoose';

export interface IChannel extends Document {
  name: string;
  description?: string;
  isPrivate: boolean;
  members: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  slackChannelId?: string; // ← NUEVO: ID del canal en Slack (ej: C0123456)
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
      index: true, // ← para buscar rápido cuando llega un evento
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IChannel>('Channel', ChannelSchema);