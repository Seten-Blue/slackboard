import dotenv from 'dotenv';
dotenv.config();

const CLIENT_ID = (process.env.SLACK_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.SLACK_CLIENT_SECRET || '').trim();
const REDIRECT_URI = (process.env.SLACK_OAUTH_REDIRECT_URI || '').trim();

// Mismos scopes de bot que ya validamos manualmente en el Slack App existente
const BOT_SCOPES = [
  'app_mentions:read',
  'channels:history',
  'channels:read',
  'channels:join',
  'channels:manage',
  'chat:write',
  'chat:write.customize',
  'groups:history',
  'groups:read',
  'groups:write',
  'im:history',
  'im:write',
  'mpim:history',
  'users:read',
  'users:read.email',
].join(',');

interface SlackOAuthResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id: string;
  app_id: string;
  team: { id: string; name: string };
  authed_user: { id: string };
  error?: string;
}

class SlackOAuthService {
  isConfigured(): boolean {
    return !!CLIENT_ID && !!CLIENT_SECRET && !!REDIRECT_URI;

    
  }

  // Trae los canales de UN workspace especifico usando SU PROPIO token — no el global
  async fetchWorkspaceChannels(botAccessToken: string): Promise<any[]> {
    const params = new URLSearchParams({
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    });

    const response = await fetch(`https://slack.com/api/conversations.list?${params.toString()}`, {
      headers: { Authorization: `Bearer ${botAccessToken}` },
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Slack rechazo la solicitud de canales: ${data.error}`);
    }

    return data.channels || [];
  }
  
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: BOT_SCOPES,
      redirect_uri: REDIRECT_URI,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<SlackOAuthResponse> {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = (await response.json()) as SlackOAuthResponse;

    if (!data.ok) {
      throw new Error(`Slack rechazo el intercambio de codigo: ${data.error || 'error desconocido'}`);
    }

    return data;
  }
}

export default new SlackOAuthService();