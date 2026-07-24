import mongoose, { Schema, Document } from 'mongoose';

export interface ISurvey extends Document {
  title: string;
  description: string;
  creator: mongoose.Types.ObjectId;
  channel?: mongoose.Types.ObjectId;
  status: 'draft' | 'active' | 'closed';
  questions: {
    text: string;
    type: 'multiple_choice' | 'single_choice' | 'text' | 'rating' | 'yes_no';
    options?: string[];
    required: boolean;
    maxRating?: number;
  }[];
  anonymous: boolean;
  allowMultipleResponses: boolean;
  expiresAt?: Date;
  responses: {
    respondent: mongoose.Types.ObjectId;
    answers: { questionIndex: number; value: string | number }[];
    submittedAt: Date;
  }[];
  targetUsers: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const SurveySchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: Schema.Types.ObjectId, ref: 'Channel', default: null },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed'],
      default: 'draft',
    },
    questions: [
      {
        text: { type: String, required: true },
        type: {
          type: String,
          enum: ['multiple_choice', 'single_choice', 'text', 'rating', 'yes_no'],
          required: true,
        },
        options: { type: [String], default: [] },
        required: { type: Boolean, default: true },
        maxRating: { type: Number, default: 5 },
      },
    ],
    anonymous: { type: Boolean, default: false },
    allowMultipleResponses: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    responses: [
      {
        respondent: { type: Schema.Types.ObjectId, ref: 'User' },
        answers: [
          {
            questionIndex: { type: Number, required: true },
            value: { type: Schema.Types.Mixed, required: true },
          },
        ],
        submittedAt: { type: Date, default: Date.now },
      },
    ],
    targetUsers: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true }
);

SurveySchema.index({ creator: 1, status: 1 });
SurveySchema.index({ channel: 1 });

SurveySchema.virtual('responseCount').get(function (this: ISurvey) {
  return this.responses ? this.responses.length : 0;
});

SurveySchema.set('toJSON', { virtuals: true });
SurveySchema.set('toObject', { virtuals: true });

export default mongoose.models.Survey || mongoose.model<ISurvey>('Survey', SurveySchema);
