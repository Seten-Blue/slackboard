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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const MessageSchema = new mongoose_1.Schema({
    content: {
        type: String,
        required: true,
    },
    channel: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Channel',
        required: true,
    },
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'sticker', 'poll', 'thread', 'task', 'survey'],
        default: 'text',
    },
    isEdited: {
        type: Boolean,
        default: false,
    },
    reactions: [
        {
            emoji: String,
            users: [
                {
                    type: mongoose_1.Schema.Types.ObjectId,
                    ref: 'User',
                },
            ],
        },
    ],
    // ← NUEVO: URLs de adjuntos/imagenes (usado por Discord, pero sirve
    // igual para cualquier plataforma que mande archivos).
    attachments: {
        type: [String],
        default: [],
    },
    // ← NUEVO: datos estructurados para encuestas
    pollData: {
        type: mongoose_1.Schema.Types.Mixed,
        default: null,
    },
    // ← NUEVO: datos estructurados para hilos
    threadData: {
        type: mongoose_1.Schema.Types.Mixed,
        default: null,
    },
    // ← NUEVO: datos estructurados para tareas
    taskData: {
        type: mongoose_1.Schema.Types.Mixed,
        default: null,
    },
    // ← NUEVO: datos estructurados para encuestas
    surveyData: {
        type: mongoose_1.Schema.Types.Mixed,
        default: null,
    },
    // ← NUEVO: ref al mensaje padre (para respuestas dentro de un thread)
    threadParent: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
        index: true,
    },
    // ← NUEVO: id del mensaje original en Discord. Permite encontrar este
    // mensaje cuando llega su edicion, borrado o una reaccion desde Discord.
    discordMessageId: {
        type: String,
        default: null,
        index: true,
    },
    // ← NUEVO: id del thread en Discord (solo en mensajes raíz de thread)
    discordThreadId: {
        type: String,
        default: null,
        index: true,
    },
    slackMessageTs: {
        type: String,
        default: null,
        index: true,
    },
    whatsappMessageId: {
        type: String,
        default: null,
        index: true,
    },
    // ← NUEVO: true si este mensaje se origino en SlackBoard y el bot lo mando
    // hacia una plataforma externa (nos dice si podemos editarlo/borrarlo alla)
    sentViaBot: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
// Índice para busquedas mas rapidas
MessageSchema.index({ channel: 1, createdAt: -1 });
exports.default = mongoose_1.default.model('Message', MessageSchema);
