import mongoose, { Document, Schema } from 'mongoose';

export interface IPerformanceMetric extends Document {
  timestamp: Date;
  server: {
    cpu: {
      model: string;
      cores: number;
      usagePercent: number;
      loadAvg: number[];
    };
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usagePercent: number;
    };
    disk: {
      totalKB: number;
      usedKB: number;
      freeKB: number;
      usagePercent: number;
    } | null;
    uptimeSeconds: number;
    process: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
    };
  };
  database: {
    latencyMs: number;
    collectionsCount: number;
    totalDocuments: number;
    databaseSizeBytes: number;
    activeConnections: number | null;
  };
  integrations: {
    name: string;
    configured: boolean;
    latencyMs: number;
  }[];
  websocket: {
    activeConnections: number;
  };
  bottlenecks: {
    metric: string;
    value: number;
    severity: 'medium' | 'high';
    detectedAt: Date;
  }[];
}

const PerformanceMetricSchema: Schema = new Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    server: {
      cpu: {
        model: String,
        cores: Number,
        usagePercent: Number,
        loadAvg: [Number],
      },
      memory: {
        totalBytes: Number,
        freeBytes: Number,
        usedBytes: Number,
        usagePercent: Number,
      },
      disk: {
        totalKB: Number,
        usedKB: Number,
        freeKB: Number,
        usagePercent: Number,
      },
      uptimeSeconds: Number,
      process: {
        rssBytes: Number,
        heapUsedBytes: Number,
        heapTotalBytes: Number,
      },
    },
    database: {
      latencyMs: Number,
      collectionsCount: Number,
      totalDocuments: Number,
      databaseSizeBytes: Number,
      activeConnections: Number,
    },
    integrations: [
      {
        name: String,
        configured: Boolean,
        latencyMs: Number,
      },
    ],
    websocket: {
      activeConnections: Number,
    },
    bottlenecks: [
      {
        metric: String,
        value: Number,
        severity: {
          type: String,
          enum: ['medium', 'high'],
        },
        detectedAt: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

PerformanceMetricSchema.index({ timestamp: -1 });

export default mongoose.model<IPerformanceMetric>('PerformanceMetric', PerformanceMetricSchema);
