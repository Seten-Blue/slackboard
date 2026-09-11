import { Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import slackOAuthService from '../services/slackOAuthService';
import Channel from '../models/Channel';
import { logAction } from './auditLogController';
import { encryptToken, decryptToken, isEncryptedToken } from '../utils/crypto';

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
      message: 'Slack OAuth no esta configurado (faltan SLACK_CLIENT_ID / SLACK_CLIENT_SECRET / SLACK_OAUTH_REDIRECT_URI en .env).',
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
      throw new Error('state invalido');
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
      botAccessToken: encryptToken(tokenData.access_token),
      connectedAt: new Date(),
    };

    if (existingIndex >= 0) {
      user.slackWorkspaces[existingIndex] = workspaceEntry;
    } else {
      user.slackWorkspaces.push(workspaceEntry);
    }

    await user.save();

    logAction(decoded.userId, 'slack.connected', 'integration', decoded.userId, 'User',
      { teamName: tokenData.team.name, teamId: tokenData.team.id });

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

    let plainToken: string;
    try {
      plainToken = decryptToken(workspace.botAccessToken) || '';
    } catch (decryptErr: any) {
      console.error('❌ No se pudo descifrar el token del workspace de Slack:', decryptErr.message);
      await removeWorkspace(req.userId!, teamId);
      return res.status(401).json({
        success: false,
        message: 'La vinculacion del workspace no pudo descifrarse (la clave de cifrado cambio). Desvincula el workspace y vuelve a conectarlo.',
        error: decryptErr.message,
      });
    }

    let slackChannels: any[] = [];
    try {
      slackChannels = await slackOAuthService.fetchWorkspaceChannels(plainToken);
    } catch (syncErr: any) {
      if (/invalid_auth|account_inactive|token_revoked|not_authed/i.test(syncErr.message || '')) {
        // Token de workspace revocado o invalido: se limpia la vinculacion para
        // liberar el estado y permitir reconectar sin dejar datos muertos.
        await removeWorkspace(req.userId!, teamId);
        logAction(req.userId!, 'slack.workspace_removed_revoked', 'integration', req.userId!, 'User',
          { teamId, reason: (syncErr.message || '').slice(0, 200) }, req.ip, req.headers['user-agent'] as string);
        return res.status(401).json({
          success: false,
          message: 'El acceso al workspace de Slack vencio (el token fue revocado o ya no es valido). Se elimino la vinculacion; vuelve a conectarlo cuando quieras.',
        });
      }
      throw syncErr;
    }

    // Migracion perezosa: tokens historicamente guardados en texto plano pasan a cifrado.
    if (!isEncryptedToken(workspace.botAccessToken)) {
      await User.updateOne(
        { _id: req.userId, 'slackWorkspaces.teamId': teamId },
        { $set: { 'slackWorkspaces.$.botAccessToken': encryptToken(workspace.botAccessToken) } }
      );
      workspace.botAccessToken = encryptToken(workspace.botAccessToken);
    }

    const synced: any[] = [];
    for (const sc of slackChannels) {
      let channel: any = await Channel.findOne({ slackChannelId: sc.id, slackTeamId: teamId });

      if (channel) {
        let changed = false;
        if (channel.displayName !== sc.name) {
          channel.displayName = sc.name;
          changed = true;
        }
        // Migrar nombres legados con prefijo "${equipo}-${canal}" a su nombre
        // real de Slack (solo si el nombre real esta libre para evitar el indice unico).
        const legacyName = `${workspace.teamName}-${sc.name}`;
        if (channel.name === legacyName) {
          const other = await Channel.findOne({ name: sc.name, _id: { $ne: channel._id } });
          if (!other) {
            channel.name = sc.name;
            changed = true;
            console.log(`✏️  Canal renombrado a nombre real de Slack: ${legacyName} -> ${sc.name}`);
          }
        }
        if (!channel.members.some((m: any) => m.toString() === req.userId)) {
          channel.members.push(req.userId);
          changed = true;
        }
        if (changed) {
          await channel.save();
        }
      } else {
        // Usar el nombre real de Slack (sin prefijo de equipo) para que coincida
        // con la UI y con la resolucion de canales al enviar mensajes.
        let internalName = sc.name;
        const nameTaken = await Channel.findOne({ name: sc.name });
        if (nameTaken) {
          // Colision de nombre unico entre workspaces/plataformas: se conserva un
          // nombre interno unico y displayName/el envio por slackChannelId cubren el resto.
          internalName = `${workspace.teamName}-${sc.name}`;
        }
        channel = await Channel.create({
          name: internalName,
          displayName: sc.name,
          description: `Canal sincronizado desde Slack (#${sc.name} en ${workspace.teamName})`,
          isPrivate: sc.is_private || false,
          platform: 'slack',
          slackChannelId: sc.id,
          slackTeamId: teamId,
          members: [req.userId],
          createdBy: req.userId,
        });
        console.log(`➕ Canal nuevo creado desde Slack OAuth: ${channel.name} (displayName: ${channel.displayName})`);
      }

      synced.push(channel);
    }

    // Poda: eliminar canales de Slack de ESTE workspace que ya no existen en Slack
    const currentIds = new Set<string>(slackChannels.map((s: any) => s.id));
    const stale = await Channel.find({ platform: 'slack', slackTeamId: teamId });
    for (const ch of stale) {
      if (ch.slackChannelId && !currentIds.has(String(ch.slackChannelId))) {
        console.log(`🗑️ Canal de Slack obsoleto eliminado: ${ch.name} (${ch.slackChannelId}) ya no existe en ${teamId}`);
        await Channel.findByIdAndDelete(ch._id);
      }
    }

    res.json({ success: true, message: `${synced.length} canales sincronizados`, data: synced });
  } catch (error: any) {
    console.error('❌ Error sincronizando workspace de Slack:', error.message);
    res.status(500).json({ success: false, message: 'Error al sincronizar el workspace', error: error.message });
  }


};

async function removeWorkspace(userId: string, teamId: string): Promise<void> {
  await User.findByIdAndUpdate(userId, { $pull: { slackWorkspaces: { teamId } } }, { runValidators: false });
}

export const unlinkWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      return res.status(400).json({ success: false, message: 'Se requiere teamId' });
    }

    await User.findByIdAndUpdate(req.userId, { $pull: { slackWorkspaces: { teamId } } });

    logAction(req.userId!, 'slack.disconnected', 'integration', req.userId!, 'User',
      { teamId }, req.ip, req.headers['user-agent'] as string);

    res.json({ success: true, message: 'Workspace de Slack desvinculado.' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al desvincular', error: error.message });
  }
};