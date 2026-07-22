import { Request, Response } from 'express';
import Channel from '../models/Channel';
import geminiService from '../services/geminiService';
import { ensureAIChannel } from '../services/aiService';
import { AuthRequest } from '../middleware/auth';

// Estado de la integracion de IA
export const getAIStatus = async (req: Request, res: Response) => {
  res.json({
    success: true,
    configured: geminiService.isConfigured(),
    message: geminiService.isConfigured()
      ? 'Gemini esta configurado y funcionando'
      : 'Gemini no esta configurado. Verifica GEMINI_API_KEY en .env',
  });
};

// Activar/desactivar la IA en un canal puntual
export const toggleAIForChannel = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    const channel = await Channel.findById(id);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Canal no encontrado',
      });
    }

    channel.aiEnabled = enabled !== undefined ? !!enabled : !channel.aiEnabled;
    await channel.save();

    res.json({
      success: true,
      message: `IA ${channel.aiEnabled ? 'activada' : 'desactivada'} en el canal`,
      data: channel,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al cambiar el estado de la IA en el canal',
      error: error.message,
    });
  }
};

// Fuerza la creacion (o devuelve si ya existe) del canal dedicado a la IA
export const getOrCreateAIChannel = async (req: AuthRequest, res: Response) => {
  try {
    const channel = await ensureAIChannel();

    // Agregar al usuario autenticado como miembro del canal de IA
    if (req.userId) {
      await Channel.findByIdAndUpdate(
        channel._id,
        { $addToSet: { members: req.userId } },
        { new: true }
      );
    }

    res.json({
      success: true,
      data: channel,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error creando el canal de IA',
      error: error.message,
    });
  }
};