const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

class WhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;
  private verifyToken: string;

  constructor() {
  this.phoneNumberId = (process.env.META_PHONE_NUMBER_ID || '').trim();
  this.accessToken = (process.env.META_ACCESS_TOKEN || '').trim();
  this.verifyToken = (process.env.META_VERIFY_TOKEN || '').trim();

  if (!this.phoneNumberId || !this.accessToken) {
    console.warn('⚠️ META_PHONE_NUMBER_ID o META_ACCESS_TOKEN no configurados.');
  } else {
    console.log('✅ WhatsApp Business configurado');
  }
}

  isConfigured(): boolean {
    return !!this.phoneNumberId && !!this.accessToken;
  }

  getVerifyToken(): string {
    return this.verifyToken;
  }

  async sendTextMessage(toPhone: string, text: string): Promise<any> {
    if (!this.isConfigured()) {
      console.log('WhatsApp no configurado, mensaje solo local:', { toPhone, text });
      return null;
    }

    const response = await fetch(`${GRAPH_API_BASE}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: text },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`WhatsApp rechazo el mensaje: ${data.error?.message || JSON.stringify(data)}`);
    }
    return data;
  }

  async sendMediaMessage(toPhone: string, mediaUrl: string, caption?: string): Promise<any> {
    if (!this.isConfigured()) return null;

    const mediaType = /\.(png|jpe?g|gif|webp)$/i.test(mediaUrl) ? 'image' : 'document';

    const response = await fetch(`${GRAPH_API_BASE}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: mediaType,
        [mediaType]: { link: mediaUrl, ...(caption ? { caption } : {}) },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`WhatsApp rechazo el adjunto: ${data.error?.message || JSON.stringify(data)}`);
    }
    return data;
  }

  // Descarga un archivo entrante: WhatsApp manda un media_id, no una URL publica directa
  async downloadIncomingMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const metaResponse = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const meta = await metaResponse.json();
    if (!metaResponse.ok) throw new Error('No se pudo obtener metadata del adjunto de WhatsApp');

    const fileResponse = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    const arrayBuffer = await fileResponse.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type };
  }
}

export default new WhatsAppService();