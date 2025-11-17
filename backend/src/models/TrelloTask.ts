import mongoose, { Document, Schema } from 'mongoose';

export interface ITrelloTask extends Document {
  trelloId: string;
  name: string;
  description?: string;
  listId: string;
  listName: string;
  boardId: string;
  boardName: string;
  assignedTo?: mongoose.Types.ObjectId;
  dueDate?: Date;
  labels: string[];
  url: string;
  channel?: mongoose.Types.ObjectId;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TrelloTaskSchema: Schema = new Schema(
  {
    trelloId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    listId: {
      type: String,
      required: true,
    },
    listName: {
      type: String,
      required: true,
    },
    boardId: {
      type: String,
      required: true,
    },
    boardName: {
      type: String,
      required: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    dueDate: {
      type: Date,
    },
    labels: [String],
    url: {
      type: String,
      required: true,
    },
    channel: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para búsquedas
TrelloTaskSchema.index({ trelloId: 1 });
TrelloTaskSchema.index({ channel: 1 });
TrelloTaskSchema.index({ boardId: 1 });

export default mongoose.model<ITrelloTask>('TrelloTask', TrelloTaskSchema);