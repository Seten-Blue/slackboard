import dotenv from 'dotenv';
dotenv.config();

const CLIENT_ID = (process.env.DISCORD_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.DISCORD_CLIENT_SECRET || '').trim();
const REDIRECT_URI = (process.env.DISCORD_OAUTH_REDIRECT_URI || '').trim();

// Ver canales, mandar mensajes, historial, reacciones, adjuntos, embeds
const BOT_PERMISSIONS = '117824';

interface DiscordTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

class DiscordOAuthService {
  isConfigured(): boolean {
    return !!CLIENT_ID && !!CLIENT_SECRET && !!REDIRECT_URI;
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'identify guilds',
      state,
      prompt: 'consent',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  buildBotInviteUrl(guildId: string): string {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: 'bot',
      permissions: BOT_PERMISSIONS,
      guild_id: guildId,
      disable_guild_select: 'true',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<DiscordTokenResponse> {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord rechazó el intercambio de código: ${text}`);
    }

    return response.json();
  }

  async refreshToken(refreshToken: string): Promise<DiscordTokenResponse> {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`No se pudo refrescar el token de Discord: ${text}`);
    }

    return response.json();
  }

  async fetchUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('No se pudo obtener el perfil de Discord del usuario');
    return response.json();
  }

  async fetchGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('No se pudieron obtener los servidores de Discord del usuario');
    return response.json();
  }
}

export default new DiscordOAuthService();