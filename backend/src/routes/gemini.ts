import express, { Request, Response } from 'express';
import geminiService, { GEMINI_MODELS } from '../services/geminiService';
import Message from '../models/Message';

const router = express.Router();

// Estado de la integración
router.get('/status', (req: Request, res: Response) => {
  const configured = geminiService.isConfigured();
  res.json({
    success: true,
    configured: configured,
    currentModel: geminiService.getCurrentModel(),
    availableModels: geminiService.getAvailableModels(),
    message: configured
      ? 'Gemini AI está configurado y funcionando'
      : 'Gemini AI no está configurado. Verifica GEMINI_API_KEY en .env',
  });
});

// Obtener modelos disponibles
router.get('/models', (req: Request, res: Response) => {
  res.json({
    success: true,
    currentModel: geminiService.getCurrentModel(),
    models: GEMINI_MODELS
  });
});

// Cambiar modelo actual
router.post('/models/select', (req: Request, res: Response) => {
  const { model } = req.body;

  if (!model) {
    return res.status(400).json({
      success: false,
      message: 'Se requiere el nombre del modelo'
    });
  }

  const changed = geminiService.setCurrentModel(model);

  if (changed) {
    res.json({
      success: true,
      message: `Modelo cambiado a ${model}`,
      currentModel: geminiService.getCurrentModel()
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Modelo no disponible'
    });
  }
});

// Chat con Gemini
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { userId, message, channelId, model } = req.body;

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

    // Generar respuesta con el modelo especificado (o el actual)
    const result = await geminiService.chat(
      userId, 
      message, 
      channelId, 
      history,
      model
    );

    res.json({
      success: true,
      data: {
        message: result.response,
        model: result.model
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
    const { text, model } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere texto para resumir',
      });
    }

    const summary = await geminiService.summarizeText(text, model);

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
    const { message, model } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un mensaje para analizar',
      });
    }

    const analysis = await geminiService.analyzeMessage(message, model);

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
    const { channelId, limit = 50, model } = req.body;

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
      messages.reverse(),
      model
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
