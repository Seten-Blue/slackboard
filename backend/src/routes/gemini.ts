import express, { Request, Response } from 'express';
import geminiService from '../services/geminiService';
import Message from '../models/Message';

const router = express.Router();

// Estado de la integración
router.get('/status', (req: Request, res: Response) => {
  const configured = geminiService.isConfigured();
  res.json({
    success: true,
    configured: configured,
    message: configured
      ? 'Gemini AI está configurado y funcionando'
      : 'Gemini AI no está configurado. Verifica GEMINI_API_KEY en .env',
  });
});

// Chat con Gemini
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { userId, message, channelId } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un mensaje',
      });
    }

    if (!geminiService.isConfigured()) {
      return res.status(400).json({
        success: false,
        message: 'Gemini AI no está configurado',
      });
    }

    // Obtener historial de conversación
    const history = await geminiService.getConversationHistory(userId);

    // Generar respuesta
    const response = await geminiService.chat(userId, message, channelId, history);

    res.json({
      success: true,
      data: {
        message: response,
      },
    });
  } catch (error: any) {
    console.error('❌ Error en chat:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error generando respuesta',
      error: error.message,
    });
  }
});

// Resumir texto
router.post('/summarize', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere texto para resumir',
      });
    }

    const summary = await geminiService.summarizeText(text);

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error: any) {
    console.error('❌ Error resumiendo:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error resumiendo texto',
      error: error.message,
    });
  }
});

// Analizar mensaje
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un mensaje para analizar',
      });
    }

    const analysis = await geminiService.analyzeMessage(message);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    console.error('❌ Error analizando:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error analizando mensaje',
      error: error.message,
    });
  }
});

// Generar resumen de canal
router.post('/channel-summary', async (req: Request, res: Response) => {
  try {
    const { channelId, limit = 50 } = req.body;

    if (!channelId) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere channelId',
      });
    }

    // Obtener mensajes del canal
    const messages = await Message.find({ channel: channelId })
      .populate('sender', 'username')
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    if (messages.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: 'No hay mensajes en este canal para resumir.',
        },
      });
    }

    const summary = await geminiService.generateChannelSummary(
      channelId,
      messages.reverse()
    );

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error: any) {
    console.error('❌ Error generando resumen:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error generando resumen',
      error: error.message,
    });
  }
});

// Limpiar historial de conversación
router.delete('/history/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await geminiService.clearConversationHistory(userId);

    res.json({
      success: true,
      message: 'Historial limpiado exitosamente',
    });
  } catch (error: any) {
    console.error('❌ Error limpiando historial:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error limpiando historial',
      error: error.message,
    });
  }
});

export default router;