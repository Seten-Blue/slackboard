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
const calendar_1 = __importDefault(require("./routes/calendar"));
const gemini_1 = __importDefault(require("./routes/gemini"));
const trello_1 = __importDefault(require("./routes/trello"));
// Importar servicios
const slackService_1 = __importDefault(require("./services/slackService"));
const geminiService_1 = __importDefault(require("./services/geminiService"));
const trelloService_1 = __importDefault(require("./services/trelloService"));
// Configurar variables de entorno
dotenv_1.default.config();
// Inicializar Express
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Configurar Socket.IO para el chat en tiempo real
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:4200",
        methods: ["GET", "POST"],
        credentials: true
    }
});
// Hacer Socket.IO disponible para las rutas
app.set('io', io);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/slackboard';
// Middlewares
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:4200",
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
// Conectar a MongoDB
mongoose_1.default.connect(MONGODB_URI)
    .then(() => {
    console.log('✅ Conectado a MongoDB exitosamente');
    console.log(`📊 Base de datos: ${MONGODB_URI}`);
})
    .catch((error) => {
    console.error('❌ Error conectando a MongoDB:', error);
    process.exit(1);
});
// Verificar estado de integraciones al iniciar
console.log('\n🔍 Verificando integraciones...');
console.log(`📌 Slack: ${slackService_1.default.isConfigured() ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`📌 Gemini AI: ${geminiService_1.default.isConfigured() ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`📌 Trello: ${trelloService_1.default.isConfigured() ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`📌 Google Calendar: ${process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ No configurado'}\n`);
// Rutas básicas
app.get('/', (req, res) => {
    res.json({
        message: '🚀 SlackBoard API está funcionando',
        version: '2.0.0',
        integrations: {
            slack: slackService_1.default.isConfigured(),
            gemini: geminiService_1.default.isConfigured(),
            trello: trelloService_1.default.isConfigured(),
            calendar: !!process.env.GOOGLE_CLIENT_ID,
        },
        endpoints: {
            health: '/health',
            channels: '/api/channels',
            messages: '/api/messages',
            analytics: '/api/analytics',
            slack: '/api/slack',
            calendar: '/api/calendar',
            gemini: '/api/gemini',
            trello: '/api/trello',
        }
    });
});
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: mongoose_1.default.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        integrations: {
            slack: slackService_1.default.isConfigured(),
            gemini: geminiService_1.default.isConfigured(),
            trello: trelloService_1.default.isConfigured(),
            calendar: !!process.env.GOOGLE_CLIENT_ID,
        }
    });
});
// Usar rutas
app.use('/api/channels', channels_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/slack', slack_1.default);
app.use('/api/calendar', calendar_1.default);
app.use('/api/gemini', gemini_1.default);
app.use('/api/trello', trello_1.default);
// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
    console.log('👤 Usuario conectado:', socket.id);
    // Unirse a un canal
    socket.on('join-channel', (channelId) => {
        socket.join(channelId);
        console.log(`✅ Usuario ${socket.id} se unió al canal: ${channelId}`);
    });
    // Salir de un canal
    socket.on('leave-channel', (channelId) => {
        socket.leave(channelId);
        console.log(`👋 Usuario ${socket.id} salió del canal: ${channelId}`);
    });
    // Enviar mensaje
    socket.on('send-message', (data) => {
        console.log('📤 Socket.IO emitiendo mensaje a canal:', data.channelId);
        io.to(data.channelId).emit('newMessage', data);
    });
    // Usuario escribiendo
    socket.on('typing', (data) => {
        socket.to(data.channelId).emit('user-typing', {
            userId: data.userId,
            username: data.username,
            channelId: data.channelId,
        });
    });
    // Usuario dejó de escribir
    socket.on('stop-typing', (data) => {
        socket.to(data.channelId).emit('user-stop-typing', {
            userId: data.userId,
            channelId: data.channelId,
        });
    });
    // Actualización de mensaje
    socket.on('update-message', (data) => {
        io.to(data.channelId).emit('message-updated', data);
    });
    // Eliminación de mensaje
    socket.on('delete-message', (data) => {
        io.to(data.channelId).emit('message-deleted', data);
    });
    // Reacción a mensaje
    socket.on('add-reaction', (data) => {
        io.to(data.channelId).emit('reaction-added', data);
    });
    socket.on('disconnect', () => {
        console.log('👋 Usuario desconectado:', socket.id);
    });
});
// Manejo de errores
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: 'Algo salió mal!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
    });
});
// Ruta no encontrada
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Ruta no encontrada',
        path: req.path
    });
});
// Manejo de señales para cierre graceful
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM recibido. Cerrando servidor...');
    httpServer.close(() => {
        console.log('✅ Servidor cerrado');
        mongoose_1.default.connection.close(false).then(() => {
            console.log('✅ Conexión a MongoDB cerrada');
            process.exit(0);
        });
    });
});
process.on('SIGINT', () => {
    console.log('👋 SIGINT recibido. Cerrando servidor...');
    httpServer.close(() => {
        console.log('✅ Servidor cerrado');
        mongoose_1.default.connection.close(false).then(() => {
            console.log('✅ Conexión a MongoDB cerrada');
            process.exit(0);
        });
    });
});
// Iniciar servidor
httpServer.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SLACKBOARD API');
    console.log('='.repeat(50));
    console.log(`📡 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🌐 Socket.IO listo para conexiones en tiempo real`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:4200'}`);
    console.log('='.repeat(50) + '\n');
});
exports.default = app;
//# sourceMappingURL=index.js.map