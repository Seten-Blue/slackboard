import mongoose, { Document, Schema } from 'mongoose';

export interface IPollOption {
  emoji: string;
  text: string;
  voters: mongoose.Types.ObjectId[];
}

export interface IPollData {
  question: string;
  options: IPollOption[];
  allowMultiple: boolean;
  isAnonymous: boolean;
  duration: number;
  createdBy: mongoose.Types.ObjectId;
  expiresAt: Date | null;
}

export interface IThreadData {
  title: string;
  initialMessage: string;
  discordThreadId?: string;
  replyCount: number;
  isArchived: boolean;
  participants: mongoose.Types.ObjectId[];
}

export interface ITaskData {
  taskId: mongoose.Types.ObjectId;
  title: string;
  status: string;
  priority: string;
  description?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  dueDate?: Date | null;
  action?: 'created' | 'status_changed';
  newStatus?: string;
  oldStatus?: string;
}

export interface ISurveyData {
  surveyId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: string;
  questionsCount: number;
  questionsPreview: { text: string; type: string }[];
  responseCount: number;
  expiresAt?: Date | null;
  anonymous: boolean;
  action?: 'created' | 'activated' | 'closed';
}

export interface IMessage extends Document {
  content: string;
  channel: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  type: 'text' | 'image' | 'file' | 'sticker' | 'poll' | 'thread' | 'task' | 'survey';
  isEdited: boolean;
  reactions: {
    emoji: string;
    users: mongoose.Types.ObjectId[];
  }[];
  attachments?: string[];
  pollData?: IPollData;
  threadData?: IThreadData;
  taskData?: ITaskData;
  surveyData?: ISurveyData;
  threadParent?: mongoose.Types.ObjectId;
  discordMessageId?: string;
  discordThreadId?: string;
  slackMessageTs?: string;
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
      enum: ['text', 'image', 'file', 'sticker', 'poll', 'thread', 'task', 'survey'],
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
    // ← NUEVO: datos estructurados para encuestas
    pollData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // ← NUEVO: datos estructurados para hilos
    threadData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // ← NUEVO: datos estructurados para tareas
    taskData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // ← NUEVO: datos estructurados para encuestas
    surveyData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    // ← NUEVO: ref al mensaje padre (para respuestas dentro de un thread)
    threadParent: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
      index: true,
    },
    // ← NUEVO: id del mensaje original en Discord. Permite encontrar este
    // mensaje cuando llega su edicion, borrado o una reaccion desde Discord.
    discordMessageId: {
      type: String,
      default: null,
      index: true,
    },
    // ← NUEVO: id del thread en Discord (solo en mensajes raíz de thread)
    discordThreadId: {
      type: String,
      default: null,
      index: true,
    },

    slackMessageTs: {
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