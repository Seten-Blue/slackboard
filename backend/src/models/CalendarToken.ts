import mongoose, { Document, Schema } from 'mongoose';

export interface ICalendarToken extends Document {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  scope: string;
  tokenType: string;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarTokenSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      default: 'default_user' // Por ahora usamos un usuario por defecto
    },
    accessToken: {
      type: String,
      required: true
    },
    refreshToken: {
      type: String
    },
    expiryDate: {
      type: Number
    },
    scope: {
      type: String,
      required: true
    },
    tokenType: {
      type: String,
      required: true,
      default: 'Bearer'
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<ICalendarToken>('CalendarToken', CalendarTokenSchema);
