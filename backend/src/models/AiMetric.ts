import mongoose, { Schema, Document } from 'mongoose';

export interface IAiMetric extends Document {
  user: mongoose.Types.ObjectId;
  channel?: mongoose.Types.ObjectId;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  responseTimeMs: number;
  query: string;
  responsePreview: string;
  success: boolean;
  errorMessage?: string;
  automationsTriggered: string[];
  department?: string;
  createdAt: Date;
}

const AiMetricSchema: Schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: Schema.Types.ObjectId, ref: 'Channel', default: null },
    modelName: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    costUsd: { type: Number, default: 0 },
    responseTimeMs: { type: Number, default: 0 },
    query: { type: String, default: '' },
    responsePreview: { type: String, default: '' },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null },
    automationsTriggered: { type: [String], default: [] },
    department: { type: String, default: null },
  },
  { timestamps: true }
);

AiMetricSchema.index({ user: 1, createdAt: -1 });
AiMetricSchema.index({ channel: 1, createdAt: -1 });
AiMetricSchema.index({ modelName: 1, createdAt: -1 });
AiMetricSchema.index({ createdAt: -1 });

export default mongoose.models.AiMetric || mongoose.model<IAiMetric>('AiMetric', AiMetricSchema);
