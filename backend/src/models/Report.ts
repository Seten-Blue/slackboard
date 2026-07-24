import mongoose, { Document, Schema } from 'mongoose';

export interface IReport extends Document {
  title: string;
  description?: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  createdBy: mongoose.Types.ObjectId;
  dateRange: {
    start: Date;
    end: Date;
  };
  filters: {
    platforms?: string[];
    channels?: string[];
    users?: string[];
  };
  data: {
    summary: {
      totalMessages: number;
      totalUsers: number;
      totalChannels: number;
      activeChannels: number;
      avgResponseTime: number;
      uptime: number;
    };
    messagesPerDay: { date: string; count: number }[];
    topChannels: { name: string; count: number; platform: string }[];
    topUsers: { username: string; count: number }[];
    platformDistribution: { platform: string; count: number }[];
    hourlyActivity: { hour: number; count: number }[];
    kpis: {
      name: string;
      value: number;
      target: number;
      unit: string;
    }[];
    comparison?: {
      previousPeriod: {
        totalMessages: number;
        totalUsers: number;
        avgResponseTime: number;
      };
      changePercent: {
        messages: number;
        users: number;
        responseTime: number;
      };
    };
  };
  status: 'generating' | 'completed' | 'failed';
  signature?: {
    signedBy: mongoose.Types.ObjectId;
    signedAt: Date;
    hash: string;
  };
  sharedWith: {
    userId: mongoose.Types.ObjectId;
    sharedAt: Date;
    permission: 'view' | 'edit';
  }[];
  exportFormats: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    type: { type: String, enum: ['daily', 'weekly', 'monthly', 'custom'], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    filters: {
      platforms: [{ type: String }],
      channels: [{ type: Schema.Types.ObjectId, ref: 'Channel' }],
      users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    },
    data: {
      summary: {
        totalMessages: { type: Number, default: 0 },
        totalUsers: { type: Number, default: 0 },
        totalChannels: { type: Number, default: 0 },
        activeChannels: { type: Number, default: 0 },
        avgResponseTime: { type: Number, default: 0 },
        uptime: { type: Number, default: 100 },
      },
      messagesPerDay: [{ date: String, count: Number }],
      topChannels: [{ name: String, count: Number, platform: String }],
      topUsers: [{ username: String, count: Number }],
      platformDistribution: [{ platform: String, count: Number }],
      hourlyActivity: [{ hour: Number, count: Number }],
      kpis: [{
        name: String,
        value: Number,
        target: Number,
        unit: String,
      }],
      comparison: {
        previousPeriod: {
          totalMessages: Number,
          totalUsers: Number,
          avgResponseTime: Number,
        },
        changePercent: {
          messages: Number,
          users: Number,
          responseTime: Number,
        },
      },
    },
    status: { type: String, enum: ['generating', 'completed', 'failed'], default: 'generating' },
    signature: {
      signedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      signedAt: { type: Date },
      hash: { type: String },
    },
    sharedWith: [{
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      sharedAt: { type: Date, default: Date.now },
      permission: { type: String, enum: ['view', 'edit'], default: 'view' },
    }],
    exportFormats: [{ type: String, default: [] }],
  },
  { timestamps: true }
);

export default mongoose.model<IReport>('Report', ReportSchema);
