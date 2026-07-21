import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  content: string;
  channel: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  type: 'text' | 'image' | 'file';
  isEdited: boolean;
  reactions: {
    emoji: string;
    users: mongoose.Types.ObjectId[];
  }[];
  attachments?: string[];
  discordMessageId?: string;
  whatsappMessageId?: string;
  sentViaBot?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    content: {
      type: String,
      required: true,
    },
    channel: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file'],
      default: 'text',
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    reactions: [
      {
        emoji: String,
        users: [
          {
            type: Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
      },
    ],
    // ← NUEVO: URLs de adjuntos/imagenes (usado por Discord, pero sirve
    // igual para cualquier plataforma que mande archivos).
    attachments: {
      type: [String],
      default: [],
    },
    // ← NUEVO: id del mensaje original en Discord. Permite encontrar este
    // mensaje cuando llega su edicion, borrado o una reaccion desde Discord.
    discordMessageId: {
      type: String,
      default: null,
      index: true,
    },

    whatsappMessageId: {
      type: String,
      default: null,
      index: true,
    },
    // ← NUEVO: true si este mensaje se origino en SlackBoard y el bot lo mando
    // hacia una plataforma externa (nos dice si podemos editarlo/borrarlo alla)
    sentViaBot: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Índice para busquedas mas rapidas
MessageSchema.index({ channel: 1, createdAt: -1 });

export default mongoose.model<IMessage>('Message', MessageSchema);