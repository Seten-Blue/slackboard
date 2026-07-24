import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actor: mongoose.Types.ObjectId;
  action: string;
  category: 'auth' | 'permissions' | 'config' | 'create' | 'modify' | 'delete' | 'access' | 'integration' | 'api' | 'ai';
  target?: string;
  targetType?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

const AuditLogSchema: Schema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    category: {
      type: String,
      enum: ['auth', 'permissions', 'config', 'create', 'modify', 'delete', 'access', 'integration', 'api', 'ai'],
      required: true,
    },
    target: { type: String, default: null },
    targetType: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    success: { type: Boolean, default: true },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
