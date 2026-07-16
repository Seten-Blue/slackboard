import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import emailService from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe una cuenta con ese email' });
    }

    const user: any = await User.create({ email, username, password, status: 'online' });
    const token = signToken(user._id.toString());

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente',
      token,
      user: { _id: user._id, email: user.email, username: user.username, avatar: user.avatar },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al crear la cuenta', error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Faltan email o password' });
    }

    const user: any = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    user.status = 'online';
    await user.save();

    const token = signToken(user._id.toString());

    res.json({
      success: true,
      message: 'Ingreso exitoso',
      token,
      user: { _id: user._id, email: user.email, username: user.username, avatar: user.avatar },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al iniciar sesión', error: error.message });
  }
};

export const me = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener el usuario', error: error.message });
  }
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Se requiere el email' });
    }

    const user: any = await User.findOne({ email });

    const genericResponse = {
      success: true,
      message: 'Si ese email tiene una cuenta, te enviamos un link para restablecer la contraseña.',
    };

    if (!user) {
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

    try {
      await emailService.sendPasswordResetEmail(email, resetLink);
    } catch (emailError: any) {
      console.error('⚠️  Error enviando el correo de recuperación:', emailError.message);
    }

    res.json(genericResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al procesar la solicitud', error: error.message });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user: any = await User.findOne({
      email,
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'El link es inválido o ya expiró. Solicitá uno nuevo.' });
    }

    user.password = newPassword;
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Contraseña actualizada. Ya podés ingresar con la nueva.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al restablecer la contraseña', error: error.message });
  }
};

export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, message: 'Falta el idToken de Google' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(401).json({ success: false, message: 'Token de Google inválido' });
    }

    let user: any = await User.findOne({ email: payload.email });

    if (!user) {
      user = await User.create({
        email: payload.email,
        username: payload.name || payload.email.split('@')[0],
        password: 'google_' + crypto.randomBytes(16).toString('hex'),
        avatar: payload.picture,
        googleId: payload.sub,
        status: 'online',
      });
    } else if (!user.googleId) {
      user.googleId = payload.sub;
      if (payload.picture && !user.avatar) user.avatar = payload.picture;
      await user.save();
    }

    const token = signToken(user._id.toString());

    res.json({
      success: true,
      message: 'Ingreso con Google exitoso',
      token,
      user: { _id: user._id, email: user.email, username: user.username, avatar: user.avatar },
    });
  } catch (error: any) {
    console.error('❌ Error verificando token de Google:', error.message);
    res.status(401).json({ success: false, message: 'No se pudo verificar el token de Google' });
  }
};