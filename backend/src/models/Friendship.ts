import mongoose, { Document, Schema } from 'mongoose';

export interface IFriendship extends Document {
  userA: mongoose.Types.ObjectId;
  userB: mongoose.Types.ObjectId;
  initiator: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const FriendshipSchema: Schema = new Schema(
  {
    userA: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    userB: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    initiator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

FriendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
FriendshipSchema.index({ userB: 1, status: 1 });
FriendshipSchema.index({ userA: 1, status: 1 });

export default mongoose.model<IFriendship>('Friendship', FriendshipSchema);
