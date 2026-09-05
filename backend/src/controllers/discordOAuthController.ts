import { Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import discordOAuthService from '../services/discordOAuthService';
import discordservice from '../services/discordservice';
import { logAction } from './auditLogController';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

function signState(userId: string): string {
  return jwt.sign({ userId, purpose: 'discord-oauth' }, JWT_SECRET, { expiresIn: '10m' });
}

export const getOAuthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user: any = await User.findById(req.userId).select('discordUserId discordUsername');
    res.json({
      success: true,
      linked: !!user?.discordUserId,
      discordUsername: user?.discordUsername || null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al consultar el estado', error: error.message });
  }
};

export const startOAuth = async (req: AuthRequest, res: Response) => {
  if (!discordOAuthService.isConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'Discord OAuth no esta configurado (faltan DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_OAUTH_REDIRECT_URI en .env).',
    });
  }

  const state = signState(req.userId!);
  const url = discordOAuthService.buildAuthorizeUrl(state);
  res.json({ success: true, url });
};

export const oauthCallback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error) {
    return res.redirect(`${FRONTEND_URL}/chat?discordLinked=denied`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/chat?discordLinked=error`);
  }

  try {
    const decoded = jwt.verify(state, JWT_SECRET) as { userId: string; purpose: string };
    if (decoded.purpose !== 'discord-oauth') {
      throw new Error('state invalido');
    }

    const tokenData = await discordOAuthService.exchangeCode(code);
    const discordUser = await discordOAuthService.fetchUser(tokenData.access_token);

    const currentUser: any = await User.findById(decoded.userId);
    if (!currentUser) throw new Error('Usuario no encontrado');

    if (currentUser.discordUserId && currentUser.discordUserId !== discordUser.id) {
      return res.redirect(`${FRONTEND_URL}/chat?discordLinked=conflict`);
    }

    const claimedByAnother = await User.findOne({
      discordUserId: discordUser.id,
      _id: { $ne: decoded.userId },
    });
    if (claimedByAnother) {
      return res.redirect(`${FRONTEND_URL}/chat?discordLinked=taken`);
    }

    currentUser.discordUserId = discordUser.id;
    currentUser.discordUsername = discordUser.username;
    currentUser.discordAvatar = discordUser.avatar;
    currentUser.discordAccessToken = tokenData.access_token;
    currentUser.discordRefreshToken = tokenData.refresh_token;
    currentUser.discordTokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    await currentUser.save();

    logAction(decoded.userId, 'discord.connected', 'integration', decoded.userId, 'User',
      { discordUsername: discordUser.username, discordId: discordUser.id });

    res.redirect(`${FRONTEND_URL}/chat?discordLinked=success`);
  } catch (err: any) {
    console.error('❌ Error en el callback de OAuth de Discord:', err.message);
    res.redirect(`${FRONTEND_URL}/chat?discordLinked=error`);
  }
};

async function getValidAccessToken(userId: string): Promise<string> {
  const user: any = await User.findById(userId);
  if (!user?.discordAccessToken) {
    throw new Error('Este usuario no vinculo su cuenta de Discord todavia.');
  }

  const isExpired = !user.discordTokenExpiresAt || new Date(user.discordTokenExpiresAt).getTime() < Date.now() + 60_000;

  if (isExpired) {
    try {
      const refreshed = await discordOAuthService.refreshToken(user.discordRefreshToken);
      user.discordAccessToken = refreshed.access_token;
      user.discordRefreshToken = refreshed.refresh_token;
      user.discordTokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      await user.save();
      return refreshed.access_token;
    } catch (refreshErr: any) {
      console.error('❌ Refresh token de Discord invalido/expirado:', refreshErr.message);
      // El refresh token fue revocado o expiro (p. ej. al regenerar las credenciales
      // del bot en el Developer Portal). Para que el usuario pueda volver a conectar
      // su cuenta, limpiamos la vinculacion guardada; si no, el modal se quedaria
      // bloqueado mostrando "token vencido" y nunca volveria a ofrecer "Conectar".
      await User.findByIdAndUpdate(userId, {
        discordUserId: null,
        discordUsername: null,
        discordAvatar: null,
        discordAccessToken: null,
        discordRefreshToken: null,
        discordTokenExpiresAt: null,
      });
      throw new Error('La vinculacion de Discord vencio (el token expiro o fue revocado). Vuelve a conectar tu cuenta de Discord.');
    }
  }

  return user.discordAccessToken;
}

export const getMyGuilds = async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getValidAccessToken(req.userId!);
    const guilds = await discordOAuthService.fetchGuilds(accessToken);

    const data = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      botPresent: discordservice.isBotInGuild(g.id),
      inviteUrl: discordOAuthService.buildBotInviteUrl(g.id),
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const syncMyGuild = async (req: AuthRequest, res: Response) => {
  try {
    const { guildId } = req.body;
    if (!guildId) {
      return res.status(400).json({ success: false, message: 'Se requiere guildId' });
    }

    if (!discordservice.isBotInGuild(guildId)) {
      return res.status(400).json({
        success: false,
        message: 'El bot todavia no esta en ese servidor. Invitalo primero.',
      });
    }

    const synced = await discordservice.syncSpecificGuild(guildId, req.userId!);
    res.json({ success: true, message: `${synced.length} canales sincronizados`, data: synced });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al sincronizar el servidor', error: error.message });
  }
};

export const unlinkDiscord = async (req: AuthRequest, res: Response) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      discordUserId: null,
      discordUsername: null,
      discordAvatar: null,
      discordAccessToken: null,
      discordRefreshToken: null,
      discordTokenExpiresAt: null,
    });

    logAction(req.userId!, 'discord.disconnected', 'integration', req.userId!, 'User',
      {}, req.ip, req.headers['user-agent'] as string);

    res.json({ success: true, message: 'Cuenta de Discord desvinculada.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al desvincular', error: error.message });
  }
};