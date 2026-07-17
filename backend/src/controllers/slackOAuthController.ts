import { Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import slackOAuthService from '../services/slackOAuthService';
import Channel from '../models/Channel';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-env';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

function signState(userId: string): string {
  return jwt.sign({ userId, purpose: 'slack-oauth' }, JWT_SECRET, { expiresIn: '10m' });
}

export const getOAuthStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user: any = await User.findById(req.userId).select('slackWorkspaces');
    res.json({
      success: true,
      workspaces: (user?.slackWorkspaces || []).map((w: any) => ({
        teamId: w.teamId,
        teamName: w.teamName,
        connectedAt: w.connectedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al consultar el estado', error: error.message });
  }
};

export const startOAuth = async (req: AuthRequest, res: Response) => {
  if (!slackOAuthService.isConfigured()) {
    return res.status(400).json({
      success: false,
      message: 'Slack OAuth no está configurado (faltan SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_OAUTH_REDIRECT_URI en .env).',
    });
  }

  const state = signState(req.userId!);
  const url = slackOAuthService.buildAuthorizeUrl(state);
  res.json({ success: true, url });
};

export const oauthCallback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error) {
    return res.redirect(`${FRONTEND_URL}/chat?slackLinked=denied`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/chat?slackLinked=error`);
  }

  try {
    const decoded = jwt.verify(state, JWT_SECRET) as { userId: string; purpose: string };
    if (decoded.purpose !== 'slack-oauth') {
      throw new Error('state inválido');
    }

    const tokenData = await slackOAuthService.exchangeCode(code);

    const user: any = await User.findById(decoded.userId);
    if (!user) throw new Error('Usuario no encontrado');

    user.slackWorkspaces = user.slackWorkspaces || [];
    const existingIndex = user.slackWorkspaces.findIndex((w: any) => w.teamId === tokenData.team.id);

    const workspaceEntry = {
      teamId: tokenData.team.id,
      teamName: tokenData.team.name,
      botUserId: tokenData.bot_user_id,
      botAccessToken: tokenData.access_token,
      connectedAt: new Date(),
    };

    if (existingIndex >= 0) {
      user.slackWorkspaces[existingIndex] = workspaceEntry;
    } else {
      user.slackWorkspaces.push(workspaceEntry);
    }

    await user.save();

    res.redirect(`${FRONTEND_URL}/chat?slackLinked=success`);
  } catch (err: any) {
    console.error('❌ Error en el callback de OAuth de Slack:', err.message);
    res.redirect(`${FRONTEND_URL}/chat?slackLinked=error`);
  }
};
export const syncMyWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Se requiere teamId' });
    }

    const user: any = await User.findById(req.userId);
    const workspace = user?.slackWorkspaces?.find((w: any) => w.teamId === teamId);

    if (!workspace) {
      return res.status(404).json({ success: false, message: 'No encontramos ese workspace vinculado a tu cuenta.' });
    }

    const slackChannels = await slackOAuthService.fetchWorkspaceChannels(workspace.botAccessToken);

    const synced: any[] = [];
    for (const sc of slackChannels) {
      let channel: any = await Channel.findOne({ slackChannelId: sc.id, slackTeamId: teamId });

      if (channel) {
        if (!channel.members.some((m: any) => m.toString() === req.userId)) {
          channel.members.push(req.userId);
          await channel.save();
        }
      } else {
        channel = await Channel.create({
          name: `${workspace.teamName}-${sc.name}`,
          description: `Canal sincronizado desde Slack (#${sc.name} en ${workspace.teamName})`,
          isPrivate: sc.is_private || false,
          platform: 'slack',
          slackChannelId: sc.id,
          slackTeamId: teamId,
          members: [req.userId],
          createdBy: req.userId,
        });
        console.log(`➕ Canal nuevo creado desde Slack OAuth: ${channel.name}`);
      }

      synced.push(channel);
    }

    res.json({ success: true, message: `${synced.length} canales sincronizados`, data: synced });
  } catch (error: any) {
    console.error('❌ Error sincronizando workspace de Slack:', error.message);
    res.status(500).json({ success: false, message: 'Error al sincronizar el workspace', error: error.message });
  }


};

export const unlinkWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Se requiere teamId' });
    }

    await User.findByIdAndUpdate(req.userId, { $pull: { slackWorkspaces: { teamId } } });
    res.json({ success: true, message: 'Workspace de Slack desvinculado.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al desvincular', error: error.message });
  }
};