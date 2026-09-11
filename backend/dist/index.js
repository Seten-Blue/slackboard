"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const mongoose_1 = __importDefault(require("mongoose"));
// Importar rutas
const channels_1 = __importDefault(require("./routes/channels"));
const messages_1 = __importDefault(require("./routes/messages"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const slack_1 = __importDefault(require("./routes/slack"));
const trello_1 = __importDefault(require("./routes/trello"));
const ai_1 = __importDefault(require("./routes/ai"));
const discord_1 = __importDefault(require("./routes/discord"));
const path_1 = __importDefault(require("path"));
const upload_1 = __importDefault(require("./routes/upload"));
const whatsapp_1 = __importDefault(require("./routes/whatsapp"));
const aiService_1 = require("./services/aiService");
const discordservice_1 = __importDefault(require("./services/discordservice"));
const trelloWatcher_1 = require("./services/trelloWatcher");
const auth_1 = __importDefault(require("./routes/auth"));
const friendship_1 = __importDefault(require("./routes/friendship"));
const reports_1 = __importDefault(require("./routes/reports"));
const performance_1 = __importDefault(require("./routes/performance"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const surveys_1 = __importDefault(require("./routes/surveys"));
const auditLog_1 = __importDefault(require("./routes/auditLog"));
const aiMetrics_1 = __importDefault(require("./routes/aiMetrics"));
// Configurar variables de entorno
dotenv_1.default.config();
// Manejo global de rechazos: nunca dejar caer el servidor por un fallo aislado
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
    console.error('⚠️ Excepcion no capturada:', error);
});
// Inicializar Express
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Configurar Socket.IO para el chat en tiempo real
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "http://localhost:4200",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';
app.set('io', io);
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString(); // guardamos el raw body para slackController
    }
}));
app.use(express_1.default.urlencoded({ extended: true }));
// Conectar a MongoDB
mongoose_1.default.connect(MONGODB_URI)
    .then(async () => {
    console.log('✅ Conectado a MongoDB exitosamente');
    try {
        await (0, aiService_1.ensureAIChannel)();
    }
    catch (err) {
        console.error('⚠️  No se pudo crear el canal de IA:', err.message);
    }
    // ← separado en su propio try/catch: si Discord falla (token malo,
    // intent no activado, etc.) no debe reportarse como error de MongoDB
    try {
        await discordservice_1.default.connect(io);
    }
    catch (err) {
        console.error('⚠️  No se pudo conectar el bot de Discord:', err.message);
    }
    // Vigilante de Trello: notifica modificaciones relevantes del tablero vinculado
    try {
        (0, trelloWatcher_1.startTrelloWatcher)(io);
    }
    catch (err) {
        console.error('⚠️  No se pudo iniciar el vigilante de Trello:', err.message);
    }
})
    .catch((error) => {
    console.error('❌ Error conectando a MongoDB:', error);
});
// Rutas basicas
app.get('/', (req, res) => {
    res.json({
        message: '🚀 SlackBoard API esta funcionando',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            channels: '/api/channels',
            messages: '/api/messages',
            analytics: '/api/analytics',
            slack: '/api/slack',
            discord: '/api/discord'
        }
    });
});
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: mongoose_1.default.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    });
});
app.get('/prueba123', (req, res) => {
    res.send('SI LLEGUE A ESTE BACKEND');
});
// Usar rutas
app.use('/api/channels', channels_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/slack', slack_1.default);
app.use('/api/trello', trello_1.default);
app.use('/api/ai', ai_1.default);
app.use('/api/discord', discord_1.default);
app.use('/api/upload', upload_1.default);
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'uploads')));
app.use('/api/whatsapp', whatsapp_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/friendship', friendship_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/performance', performance_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/surveys', surveys_1.default);
app.use('/api/audit', auditLog_1.default);
app.use('/api/ai-metrics', aiMetrics_1.default);
// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
    console.log('👤 Usuario conectado:', socket.id);
    // Unirse a un canal
    socket.on('join-channel', (channelId) => {
        socket.join(channelId);
        console.log(`Usuario ${socket.id} se unio al canal: ${channelId}`);
    });
    // Unirse a la sala personal del usuario (para notificaciones de amistad)
    socket.on('join-user', (userId) => {
        socket.join(`user:${userId}`);
        console.log(`Usuario ${socket.id} se unio a su sala: user:${userId}`);
    });
    // Enviar mensaje
    socket.on('send-message', (data) => {
        // Se emite a TODA la sala (incluido el emisor) para que los contadores
        // de mensajes por canal se mantengan consistentes en el frontend.
        io.to(data.channelId).emit('new-message', data);
    });
    // Usuario escribiendo
    socket.on('typing', (data) => {
        socket.to(data.channelId).emit('user-typing', data);
    });
    socket.on('disconnect', () => {
        console.log('👋 Usuario desconectado:', socket.id);
    });
});
// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Algo salio mal!',
        message: err.message
    });
});
// Iniciar servidor
httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📡 Socket.IO listo para conexiones en tiempo real`);
});
