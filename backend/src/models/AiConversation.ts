import mongoose, { Document, Schema } from 'mongoose';

export interface IAiConversation extends Document {
  userId: mongoose.Types.ObjectId;
  channelId?: mongoose.Types.ObjectId;
  messages: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }[];
  context?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiConversationSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
    },
    messages: [
      {
        role: {
          type: String,
          enum: ['user', 'assistant'],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    context: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Índice para búsquedas
AiConversationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IAiConversation>('AiConversation', AiConversationSchema);