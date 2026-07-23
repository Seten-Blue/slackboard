import express from 'express';
import { register, login, me, updateProfile, forgotPassword, resetPassword, googleAuth } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import User from '../models/User';

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

router.put('/trello', requireAuth, async (req: any, res: any) => {
  try {
    const { trelloApiKey, trelloToken } = req.body;
    if (!trelloApiKey || !trelloToken) {
      return res.status(400).json({ success: false, message: 'Se requiere trelloApiKey y trelloToken' });
    }
    await User.findByIdAndUpdate(req.userId, { trelloApiKey, trelloToken });
    res.json({ success: true, message: 'Trello vinculado correctamente' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al vincular Trello' });
  }
});

router.delete('/trello', requireAuth, async (req: any, res: any) => {
  try {
    await User.findByIdAndUpdate(req.userId, { trelloApiKey: null, trelloToken: null });
    res.json({ success: true, message: 'Trello desvinculado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al desvincular Trello' });
  }
});

router.get('/trello/status', requireAuth, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.userId).select('trelloApiKey trelloToken');
    res.json({ success: true, data: { linked: !!(user as any)?.trelloApiKey && !!(user as any)?.trelloToken } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al verificar Trello' });
  }
});

export default router;