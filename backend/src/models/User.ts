import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  email: string;
  username: string;
  password: string;
  avatar?: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
  idioma?: string;
  bio?: string;
  ubicacion?: string;
  intereses?: string[];
  github?: string;
  linkedin?: string;
  website?: string;
  trelloApiKey?: string;
  trelloToken?: string;
  status: 'online' | 'offline' | 'away';
  role: 'owner' | 'admin' | 'manager' | 'member' | 'guest';
  googleId?: string;
  discordUserId?: string;
  discordUsername?: string;
  discordAvatar?: string;
  discordAccessToken?: string;
  discordRefreshToken?: string;
  discordTokenExpiresAt?: Date;
  slackWorkspaces?: {
    teamId: string;
    teamName: string;
    botUserId: string;
    botAccessToken: string;
    connectedAt: Date;
  }[];
  resetPasswordTokenHash?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    nombre: {
      type: String,
      default: null,
      trim: true,
    },
    apellido: {
      type: String,
      default: null,
      trim: true,
    },
    telefono: {
      type: String,
      default: null,
      trim: true,
    },
    idioma: {
      type: String,
      default: null,
      trim: true,
    },
    bio: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    ubicacion: {
      type: String,
      default: null,
      trim: true,
    },
    intereses: {
      type: [String],
      default: [],
    },
    github: {
      type: String,
      default: null,
      trim: true,
    },
    linkedin: {
      type: String,
      default: null,
      trim: true,
    },
    website: {
      type: String,
      default: null,
      trim: true,
    },
    trelloApiKey: {
      type: String,
      default: null,
    },
    trelloToken: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away'],
      default: 'offline',
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'manager', 'member', 'guest'],
      default: 'member',
    },
    googleId: {
      type: String,
      default: null,
      index: true,
    },
    discordUserId: { type: String, default: null, index: true },
    discordUsername: { type: String, default: null },
    discordAvatar: { type: String, default: null },
    discordAccessToken: { type: String, default: null },
    discordRefreshToken: { type: String, default: null },
    discordTokenExpiresAt: { type: Date, default: null },
    slackWorkspaces: [
      {
        teamId: { type: String, required: true },
        teamName: { type: String, required: true },
        botUserId: { type: String, required: true },
        botAccessToken: { type: String, required: true },
        connectedAt: { type: Date, default: Date.now },
      },
    ],
    
    resetPasswordTokenHash: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('save', async function (next) {
  const user = this as any;
  if (!user.isModified('password')) return next();
  user.password = await bcrypt.hash(user.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);