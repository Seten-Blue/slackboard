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
// Configurar variables de entorno
dotenv_1.default.config();
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
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Conectar a MongoDB
mongoose_1.default.connect(MONGODB_URI)
    .then(() => {
    console.log('✅ Conectado a MongoDB exitosamente');
})
    .catch((error) => {
    console.error('❌ Error conectando a MongoDB:', error);
});
// Rutas básicas
app.get('/', (req, res) => {
    res.json({
        message: '🚀 SlackBoard API está funcionando',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            channels: '/api/channels',
            messages: '/api/messages',
            analytics: '/api/analytics',
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
// Usar rutas
app.use('/api/channels', channels_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/analytics', analytics_1.default);
// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
    console.log('👤 Usuario conectado:', socket.id);
    // Unirse a un canal
    socket.on('join-channel', (channelId) => {
        socket.join(channelId);
        console.log(`Usuario ${socket.id} se unió al canal: ${channelId}`);
    });
    // Enviar mensaje
    socket.on('send-message', (data) => {
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
        error: 'Algo salió mal!',
        message: err.message
    });
});
// Iniciar servidor
httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📡 Socket.IO listo para conexiones en tiempo real`);
});
