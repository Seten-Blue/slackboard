"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const UserSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true,
});
UserSchema.pre('save', async function (next) {
    const user = this;
    if (!user.isModified('password'))
        return next();
    user.password = await bcryptjs_1.default.hash(user.password, 10);
    next();
});
UserSchema.methods.comparePassword = async function (candidate) {
    return bcryptjs_1.default.compare(candidate, this.password);
};
exports.default = mongoose_1.default.model('User', UserSchema);
