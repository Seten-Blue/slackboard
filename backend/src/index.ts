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
import path from 'path';
import uploadRouter from './routes/upload';

import whatsappRouter from './routes/whatsapp';
import { ensureAIChannel } from './services/aiService';
import discordservice from './services/discordservice';
import { startTrelloWatcher } from './services/trelloWatcher';
import authRouter from './routes/auth';
import friendshipRouter from './routes/friendship';
import reportsRouter from './routes/reports';
import performanceRouter from './routes/performance';
import tasksRouter from './routes/tasks';
import surveysRouter from './routes/surveys';
import auditLogRouter from './routes/auditLog';
import aiMetricsRouter from './routes/aiMetrics';
// Configurar variables de entorno
dotenv.config();  

// Manejo global de rechazos: nunca dejar caer el servidor por un fallo aislado
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('⚠️ Excepcion no capturada:', error);
});

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

    // Vigilante de Trello: notifica modificaciones relevantes del tablero vinculado
    try {
      startTrelloWatcher(io);
    } catch (err: any) {
      console.error('⚠️  No se pudo iniciar el vigilante de Trello:', err.message);
    }
  })
  .catch((error) => {
    console.error('❌ Error conectando a MongoDB:', error);
  });

// Rutas basicas
app.get('/', (req: Request, res: Response) => {
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

app.use('/api/upload', uploadRouter);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/auth', authRouter);
app.use('/api/friendship', friendshipRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/audit', auditLogRouter);
app.use('/api/ai-metrics', aiMetricsRouter);

// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  // Unirse a un canal
  socket.on('join-channel', (channelId: string) => {
    socket.join(channelId);
    console.log(`Usuario ${socket.id} se unio al canal: ${channelId}`);
  });

  // Unirse a la sala personal del usuario (para notificaciones de amistad)
  socket.on('join-user', (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`Usuario ${socket.id} se unio a su sala: user:${userId}`);
  });

  // Enviar mensaje
  socket.on('send-message', (data: any) => {
    // Se emite a TODA la sala (incluido el emisor) para que los contadores
    // de mensajes por canal se mantengan consistentes en el frontend.
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
    error: 'Algo salio mal!',
    message: err.message
  });
});

// Iniciar servidor
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📡 Socket.IO listo para conexiones en tiempo real`);
});     