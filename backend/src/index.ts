import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

// Importar rutas
import channelsRouter from './routes/channels';
import messagesRouter from './routes/messages';
import analyticsRouter from './routes/analytics';
import slackRouter from './routes/slack';
import trelloRouter from './routes/trello';
import aiRouter from './routes/ai';
import discordRouter from './routes/discord';
import whatsappRouter from './routes/whatsapp';
import { ensureAIChannel } from './services/aiService';
import discordservice from './services/discordservice';
import authRouter from './routes/auth';
// Configurar variables de entorno
dotenv.config();

// Inicializar Express
const app: Express = express();
const httpServer = createServer(app);

// Configurar Socket.IO para el chat en tiempo real
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:4200",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

app.set('io', io);

// Middlewares
app.use(cors());
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString(); // guardamos el raw body para slackController
  }
}));
app.use(express.urlencoded({ extended: true }));

// Conectar a MongoDB
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('✅ Conectado a MongoDB exitosamente');

    try {
      await ensureAIChannel();
    } catch (err: any) {
      console.error('⚠️  No se pudo crear el canal de IA:', err.message);
    }

    // ← separado en su propio try/catch: si Discord falla (token malo,
    // intent no activado, etc.) no debe reportarse como error de MongoDB
    try {
      await discordservice.connect(io);
    } catch (err: any) {
      console.error('⚠️  No se pudo conectar el bot de Discord:', err.message);
    }
  })
  .catch((error) => {
    console.error('❌ Error conectando a MongoDB:', error);
  });

// Rutas básicas
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: '🚀 SlackBoard API está funcionando',
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

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

app.get('/prueba123', (req, res) => {
  res.send('SI LLEGUE A ESTE BACKEND');
});

// Usar rutas
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/slack', slackRouter);
app.use('/api/trello', trelloRouter);
app.use('/api/ai', aiRouter);
app.use('/api/discord', discordRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/auth', authRouter);

// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  // Unirse a un canal
  socket.on('join-channel', (channelId: string) => {
    socket.join(channelId);
    console.log(`Usuario ${socket.id} se unió al canal: ${channelId}`);
  });

  // Enviar mensaje
  socket.on('send-message', (data: any) => {
    io.to(data.channelId).emit('new-message', data);
  });

  // Usuario escribiendo
  socket.on('typing', (data: any) => {
    socket.to(data.channelId).emit('user-typing', data);
  });

  socket.on('disconnect', () => {
    console.log('👋 Usuario desconectado:', socket.id);
  });
});

// Manejo de errores
app.use((err: any, req: Request, res: Response, next: any) => {
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