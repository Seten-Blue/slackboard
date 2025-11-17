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

// Hacer Socket.IO disponible para las rutas
app.set('io', io);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conectar a MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB exitosamente');
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
      calendar: '/api/calendar'
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

// Usar rutas
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/slack', slackRouter);
app.use('/api/calendar', calendarRouter);

// Socket.IO para mensajes en tiempo real
io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  // Unirse a un canal
  socket.on('join-channel', (channelId: string) => {
    socket.join(channelId);
    console.log(`Usuario ${socket.id} se unió al canal: ${channelId}`);
  });

  // Enviar mensaje - EMITIR A TODOS INCLUYENDO AL EMISOR
  socket.on('send-message', (data: any) => {
    console.log('📤 Socket.IO emitiendo mensaje a canal:', data.channelId);
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