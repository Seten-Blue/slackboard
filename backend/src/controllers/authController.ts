import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { logAction } from './auditLogController';
import emailService from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

export const register = async (req: Request, res: Response) => {
  try {
    const { email, username, password, nombre, apellido, telefono, idioma } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Ya existe una cuenta con ese email' });
    }

    const user: any = await User.create({
      email,
      username,
      password,
      nombre: nombre || null,
      apellido: apellido || null,
      telefono: telefono || null,
      idioma: idioma || null,
      status: 'online',
      role: 'member',
    });
    const token = signToken(user._id.toString());

    logAction(user._id.toString(), 'register', 'auth', user._id.toString(), 'User',
      { email, username }, req.ip, req.headers['user-agent']);

    res.status(201).json({
      success: true,
      message: 'Cuenta creada exitosamente',
      token,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        idioma: user.idioma,
        bio: user.bio,
        ubicacion: user.ubicacion,
        intereses: user.intereses,
        github: user.github,
        linkedin: user.linkedin,
        website: user.website,
        role: user.role,
      },
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
      logAction(user?._id?.toString() || null, 'login.failed', 'auth', undefined, 'User',
        { email }, req.ip, req.headers['user-agent'], false, 'Credenciales invalidas');
      return res.status(401).json({ success: false, message: 'Credenciales invalidas' });
    }

    user.status = 'online';
    await user.save();

    const token = signToken(user._id.toString());

    logAction(user._id.toString(), 'login.success', 'auth', user._id.toString(), 'User',
      { email }, req.ip, req.headers['user-agent']);

    res.json({
      success: true,
      message: 'Ingreso exitoso',
      token,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        idioma: user.idioma,
        bio: user.bio,
        ubicacion: user.ubicacion,
        intereses: user.intereses,
        github: user.github,
        linkedin: user.linkedin,
        website: user.website,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al iniciar sesion', error: error.message });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { username, avatar, nombre, apellido, telefono, idioma, bio, ubicacion, intereses, github, linkedin, website } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'No autenticado' });
    }

    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: 'El nombre de usuario es requerido' });
    }

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
      return res.status(400).json({ success: false, message: 'El nombre de usuario debe tener entre 2 y 30 caracteres' });
    }

    const existingUser = await User.findOne({ username: trimmedUsername, _id: { $ne: userId } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Ese nombre de usuario ya esta en uso' });
    }

    const updateData: any = { username: trimmedUsername };
    if (avatar !== undefined) updateData.avatar = avatar || null;
    if (nombre !== undefined) updateData.nombre = nombre || null;
    if (apellido !== undefined) updateData.apellido = apellido || null;
    if (telefono !== undefined) updateData.telefono = telefono || null;
    if (idioma !== undefined) updateData.idioma = idioma || null;
    if (bio !== undefined) updateData.bio = bio || null;
    if (ubicacion !== undefined) updateData.ubicacion = ubicacion || null;
    if (intereses !== undefined) updateData.intereses = Array.isArray(intereses) ? intereses : [];
    if (github !== undefined) updateData.github = github || null;
    if (linkedin !== undefined) updateData.linkedin = linkedin || null;
    if (website !== undefined) updateData.website = website || null;

    console.log('📝 updateProfile:', JSON.stringify(updateData, null, 2));

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    res.json({
      success: true,
      message: 'Perfil actualizado',
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        idioma: user.idioma,
        bio: user.bio,
        ubicacion: user.ubicacion,
        intereses: user.intereses,
        github: user.github,
        linkedin: user.linkedin,
        website: user.website,
      },
    });
  } catch (error: any) {
    console.error('Error actualizando perfil:', error.message);
    res.status(500).json({ success: false, message: 'Error al actualizar el perfil', error: error.message });
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
      message: 'Si ese email tiene una cuenta, te enviamos un link para restablecer la contrasena.',
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
      console.error('⚠️  Error enviando el correo de recuperacion:', emailError.message);
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
      return res.status(400).json({ success: false, message: 'El link es invalido o ya expiro. Solicita uno nuevo.' });
    }

    user.password = newPassword;
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    logAction(user._id.toString(), 'password_changed', 'auth', user._id.toString(), 'User',
      {}, req.ip, req.headers['user-agent']);

    res.json({ success: true, message: 'Contraseña actualizada. Ya puedes ingresar con la nueva.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al restablecer la contrasena', error: error.message });
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
      return res.status(401).json({ success: false, message: 'Token de Google invalido' });
    }

    let user: any = await User.findOne({ email: payload.email });

    if (!user) {
      user = await User.create({
        email: payload.email,
        username: payload.name || payload.email.split('@')[0],
        password: 'google_' + crypto.randomBytes(16).toString('hex'),
        avatar: payload.picture,
        googleId: payload.sub,
        nombre: payload.given_name || null,
        apellido: payload.family_name || null,
        idioma: payload.locale || null,
        status: 'online',
      });
    } else {
      let needsSave = false;
      if (!user.googleId) {
        user.googleId = payload.sub;
        needsSave = true;
      }
      if (payload.picture && !user.avatar) {
        user.avatar = payload.picture;
        needsSave = true;
      }
      if (payload.given_name && !user.nombre) {
        user.nombre = payload.given_name;
        needsSave = true;
      }
      if (payload.family_name && !user.apellido) {
        user.apellido = payload.family_name;
        needsSave = true;
      }
      if (payload.locale && !user.idioma) {
        user.idioma = payload.locale;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
    }

    const token = signToken(user._id.toString());

    res.json({
      success: true,
      message: 'Ingreso con Google exitoso',
      token,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        idioma: user.idioma,
        bio: user.bio,
        ubicacion: user.ubicacion,
        intereses: user.intereses,
        github: user.github,
        linkedin: user.linkedin,
        website: user.website,
      },
    });
  } catch (error: any) {
    console.error('Error verificando token de Google:', error.message);
    res.status(401).json({ success: false, message: 'No se pudo verificar el token de Google' });
  }
};