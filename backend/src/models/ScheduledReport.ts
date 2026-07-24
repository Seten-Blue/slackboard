import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledReport extends Document {
  title: string;
  type: 'daily' | 'weekly' | 'monthly';
  createdBy: mongoose.Types.ObjectId;
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly';
    dayOfWeek?: number;
    dayOfMonth?: number;
    hour: number;
    timezone: string;
  };
  recipients: mongoose.Types.ObjectId[];
  filters: {
    platforms?: string[];
    channels?: string[];
  };
  format: string[];
  lastGenerated?: Date;
  nextGeneration: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledReportSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    schedule: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
      dayOfWeek: { type: Number, min: 0, max: 6 },
      dayOfMonth: { type: Number, min: 1, max: 31 },
      hour: { type: Number, default: 8, min: 0, max: 23 },
      timezone: { type: String, default: 'America/Mexico_City' },
    },
    recipients: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    filters: {
      platforms: [{ type: String }],
      channels: [{ type: Schema.Types.ObjectId, ref: 'Channel' }],
    },
    format: [{ type: String, default: ['pdf'] }],
    lastGenerated: { type: Date },
    nextGeneration: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IScheduledReport>('ScheduledReport', ScheduledReportSchema);
