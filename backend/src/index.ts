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
import calendarRouter from './routes/calendar';
import geminiRouter from './routes/gemini';
import trelloRouter from './routes/trello';

// Importar servicios
import slackService from './services/slackService';
import geminiService from './services/geminiService';
import trelloService from './services/trelloService';

// Configurar variables de entorno
dotenv.config();

// Inicializar Express
const app: Express = express();
const httpServer = createServer(app);

// Configurar Socket.IO para el chat en tiempo real
const io = new Server(httpServer, {
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
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:4200",
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Conectar a MongoDB
mongoose.connect(MONGODB_URI)
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
console.log(`📌 Slack: ${slackService.isConfigured() ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`📌 Gemini AI: ${geminiService.isConfigured() ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`📌 Trello: ${trelloService.isConfigured() ? '✅ Configurado' : '❌ No configurado'}`);
console.log(`📌 Google Calendar: ${process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ No configurado'}\n`);

// Rutas básicas
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: '🚀 SlackBoard API está funcionando',
    version: '2.0.0',
    integrations: {
      slack: slackService.isConfigured(),
      gemini: geminiService.isConfigured(),
      trello: trelloService.isConfigured(),
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

app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    integrations: {
      slack: slackService.isConfigured(),
      gemini: geminiService.isConfigured(),
      trello: trelloService.isConfigured(),
      calendar: !!process.env.GOOGLE_CLIENT_ID,
    }
  });
});

// Usar rutas
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/slack', slackRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/trello', trelloRouter);

// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  // Unirse a un canal
  socket.on('join-channel', (channelId: string) => {
    socket.join(channelId);
    console.log(`✅ Usuario ${socket.id} se unió al canal: ${channelId}`);
  });

  // Salir de un canal
  socket.on('leave-channel', (channelId: string) => {
    socket.leave(channelId);
    console.log(`👋 Usuario ${socket.id} salió del canal: ${channelId}`);
  });

  // Enviar mensaje
  socket.on('send-message', (data: any) => {
    console.log('📤 Socket.IO emitiendo mensaje a canal:', data.channelId);
    io.to(data.channelId).emit('newMessage', data);
  });

  // Usuario escribiendo
  socket.on('typing', (data: any) => {
    socket.to(data.channelId).emit('user-typing', {
      userId: data.userId,
      username: data.username,
      channelId: data.channelId,
    });
  });

  // Usuario dejó de escribir
  socket.on('stop-typing', (data: any) => {
    socket.to(data.channelId).emit('user-stop-typing', {
      userId: data.userId,
      channelId: data.channelId,
    });
  });

  // Actualización de mensaje
  socket.on('update-message', (data: any) => {
    io.to(data.channelId).emit('message-updated', data);
  });

  // Eliminación de mensaje
  socket.on('delete-message', (data: any) => {
    io.to(data.channelId).emit('message-deleted', data);
  });

  // Reacción a mensaje
  socket.on('add-reaction', (data: any) => {
    io.to(data.channelId).emit('reaction-added', data);
  });

  socket.on('disconnect', () => {
    console.log('👋 Usuario desconectado:', socket.id);
  });
});

// Manejo de errores
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('❌ Error:', err.stack);
  res.status(err.status || 500).json({ 
    success: false,
    error: 'Algo salió mal!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor'
  });
});

// Ruta no encontrada
app.use((req: Request, res: Response) => {
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
    mongoose.connection.close(false).then(() => {
      console.log('✅ Conexión a MongoDB cerrada');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT recibido. Cerrando servidor...');
  httpServer.close(() => {
    console.log('✅ Servidor cerrado');
    mongoose.connection.close(false).then(() => {
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

export default app;