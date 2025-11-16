import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalytics extends Document {
  date: Date;
  activeUsers: number;
  totalMessages: number;
  totalChannels: number;
  messagesPerChannel: {
    channelId: mongoose.Types.ObjectId;
    channelName: string;
    count: number;
  }[];
  topUsers: {
    userId: mongoose.Types.ObjectId;
    username: string;
    messageCount: number;
  }[];
  peakHours: {
    hour: number;
    messageCount: number;
  }[];
  createdAt: Date;
}

const AnalyticsSchema: Schema = new Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
    },
    activeUsers: {
      type: Number,
      default: 0,
    },
    totalMessages: {
      type: Number,
      default: 0,
    },
    totalChannels: {
      type: Number,
      default: 0,
    },
    messagesPerChannel: [
      {
        channelId: {
          type: Schema.Types.ObjectId,
          ref: 'Channel',
        },
        channelName: String,
        count: Number,
      },
    ],
    topUsers: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        username: String,
        messageCount: Number,
      },
    ],
    peakHours: [
      {
        hour: Number,
        messageCount: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);