import crypto from 'crypto';

const ENC_PREFIX = 'tokenenc.v1.';

function resolveKey(): Buffer {
  const configured = (process.env.TOKEN_ENCRYPTION_KEY || '').trim();
  if (configured) {
    const key = Buffer.from(configured, 'hex');
    if (key.length === 32) return key;
  }
  return crypto.createHash('sha256').update((process.env.JWT_SECRET || 'change-me-in-env').trim()).digest();
}

export function isEncryptedToken(payload: string | undefined | null): boolean {
  return !!payload && payload.startsWith(ENC_PREFIX);
}

export function encryptToken(plain: string | undefined | null): string | null {
  if (plain === undefined || plain === null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', resolveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptToken(payload: string | undefined | null): string | null {
  if (payload === undefined || payload === null || payload === '') return null;
  if (!isEncryptedToken(payload)) return payload;
  const [ivB64, tagB64, dataB64] = payload.slice(ENC_PREFIX.length).split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Token cifrado con formato invalido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', resolveKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}