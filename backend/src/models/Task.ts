import mongoose, { Schema, Document } from 'mongoose';

export interface ITask extends Document {
  title: string;
  description: string;
  creator: mongoose.Types.ObjectId;
  assignee?: mongoose.Types.ObjectId;
  channel?: mongoose.Types.ObjectId;
  assignedBy?: mongoose.Types.ObjectId;
  assignmentChannel?: mongoose.Types.ObjectId;
  assignerRole?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  estimatedHours?: number;
  actualHours: number;
  tags: string[];
  subtasks: { title: string; completed: boolean }[];
  timeEntries: { user: mongoose.Types.ObjectId; start: Date; end?: Date; description: string }[];
  completedAt?: Date;
  comments: { user: mongoose.Types.ObjectId; text: string; createdAt: Date }[];
  attachments: { filename: string; url: string; uploadedBy: mongoose.Types.ObjectId; uploadedAt: Date }[];
  source?: 'slack' | 'discord' | 'trello' | 'manual' | 'ai';
  sourceId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    channel: { type: Schema.Types.ObjectId, ref: 'Channel', default: null },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignmentChannel: { type: Schema.Types.ObjectId, ref: 'Channel', default: null },
    assignerRole: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    dueDate: { type: Date, default: null },
    estimatedHours: { type: Number, default: null },
    actualHours: { type: Number, default: 0 },
    tags: { type: [String], default: [] },
    subtasks: [
      {
        title: { type: String, required: true },
        completed: { type: Boolean, default: false },
      },
    ],
    timeEntries: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        start: { type: Date, required: true },
        end: { type: Date, default: null },
        description: { type: String, default: '' },
      },
    ],
    completedAt: { type: Date, default: null },
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    attachments: [
      {
        filename: String,
        url: String,
        uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    source: { type: String, enum: ['slack', 'discord', 'trello', 'manual', 'ai'], default: 'manual' },
    sourceId: { type: String, default: null },
    discordNotificationMessageId: { type: String, default: null },
  },
  { timestamps: true }
);

TaskSchema.index({ creator: 1, status: 1 });
TaskSchema.index({ assignee: 1, status: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ channel: 1 });

export default mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema);
