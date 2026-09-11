import express from 'express';
import { register, login, me, updateProfile, forgotPassword, resetPassword, googleAuth } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { logAction } from '../controllers/auditLogController';
import User from '../models/User';
import trelloService from '../services/trelloService';
import { encryptToken } from '../utils/crypto';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);
router.put('/profile', requireAuth, updateProfile);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/google', googleAuth);

router.get('/user/:id', async (req: any, res: any) => {
  try {
    const user = await User.findById(req.params.id)
      .select('username avatar nombre apellido bio ubicacion intereses github linkedin website status createdAt');
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener usuario' });
  }
});

// ===== Trello per-user auth (1/authorize + postMessage) =====

router.get('/trello/status', requireAuth, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.userId).select('trelloToken');
    res.json({
      success: true,
      data: {
        linked: !!(user as any)?.trelloToken,
        configured: trelloService.isConfigured(),
        apiKey: trelloService.getApiKey(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al verificar Trello' });
  }
});

router.get('/trello/start', requireAuth, async (req: any, res: any) => {
  if (!trelloService.isConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'Trello no esta configurado. Falta TRELLO_API_KEY en .env del backend.',
    });
  }

  const apiKey = trelloService.getApiKey();
  const authUrl = `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=${apiKey}&return_url=${encodeURIComponent(FRONTEND_URL)}&callback_method=postMessage`;

  res.json({ success: true, url: authUrl });
});

router.post('/trello/finish', requireAuth, async (req: any, res: any) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Se requiere el token de Trello' });
    }

    // Verify the token is valid by calling Trello API
    const verifyUrl = `https://api.trello.com/1/members/me?key=${trelloService.getApiKey()}&token=${token}`;
    const response = await fetch(verifyUrl);
    if (!response.ok) {
      return res.status(400).json({ success: false, message: 'El token de Trello no es valido' });
    }

    const trelloUser = await response.json();

    // Save the token encrypted at rest (API key is global in .env)
    await User.findByIdAndUpdate(req.userId, {
      trelloToken: encryptToken(token),
      trelloApiKey: trelloService.getApiKey(),
    });

    logAction(req.userId, 'trello.connected', 'integration', req.userId, 'User',
      { trelloUsername: trelloUser.username }, req.ip, req.headers['user-agent']);

    res.json({
      success: true,
      message: 'Trello vinculado correctamente',
      data: { username: trelloUser.username },
    });
  } catch (error: any) {
    console.error('Error finalizando Trello auth:', error.message);
    res.status(500).json({ success: false, message: 'Error al vincular Trello' });
  }
});

router.delete('/trello/unlink', requireAuth, async (req: any, res: any) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      trelloToken: null,
      trelloApiKey: null,
    });

    logAction(req.userId, 'trello.disconnected', 'integration', req.userId, 'User',
      {}, req.ip, req.headers['user-agent']);

    res.json({ success: true, message: 'Trello desvinculado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al desvincular Trello' });
  }
});

export default router;
