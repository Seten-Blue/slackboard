import express, { Request, Response } from 'express';
import discordservice from '../services/discordservice';
import { requireAuth, AuthRequest } from '../middleware/auth';

import {
  getOAuthStatus,
  startOAuth,
  oauthCallback,
  getMyGuilds,
  syncMyGuild,
} from '../controllers/discordOAuthController';

const router = express.Router();


// Estado de la integración
router.get('/status', (req: Request, res: Response) => {
  const configured = discordservice.isConfigured();
  res.json({
    success: true,
    configured,
    message: configured
      ? 'Discord está configurado y funcionando'
      : 'Discord no está configurado (o el bot todavía no terminó de conectar). Verifica DISCORD_BOT_TOKEN.',
  });
});

// Sincronizar canales de texto de los servidores del bot con la base de datos
router.post('/sync-channels', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const synced = await discordservice.syncGuildChannels(req.userId);
    res.json({
      success: true,
      message: `${synced.length} canales sincronizados`,
      data: synced,
    });
  } catch (error: any) {
    console.error('❌ Error sincronizando canales de Discord:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al sincronizar canales',
      error: error.message,
    });
  }
});

// Enviar mensaje desde SlackBoard hacia Discord
// Nota: a diferencia de Slack (que recibía channelName), aquí se manda el
// _id interno del Channel de SlackBoard, porque los nombres de canal de
// Discord no son únicos entre servidores.
router.post('/send-message', async (req: Request, res: Response) => {
  try {
    const { channelId, text } = req.body;

    if (!channelId || !text) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere channelId (id interno del canal en SlackBoard) y text',
      });
    }

    await discordservice.sendMessage(channelId, text);

    res.json({
      success: true,
      message: 'Mensaje enviado a Discord',
    });
  } catch (error: any) {
    console.error('❌ Error enviando mensaje a Discord:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al enviar mensaje',
      error: error.message,
    });
  }
});

// ===== OAuth por usuario (vinculación real de cuenta) =====
router.get('/oauth/status', requireAuth, getOAuthStatus);
router.get('/oauth/start', requireAuth, startOAuth);
router.get('/oauth/callback', oauthCallback); // público: Discord redirige acá sin nuestro header Authorization
router.get('/oauth/my-guilds', requireAuth, getMyGuilds);
router.post('/oauth/sync-guild', requireAuth, syncMyGuild);

export default router;