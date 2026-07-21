import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

interface HistoryTurn {
  role: 'user' | 'model';
  text: string;
}

interface GeminiReply {
  text: string;
  switchedTo?: string; // nombre amigable del modelo, solo si hubo un cambio en esta llamada
}

const SYSTEM_PROMPT = `Sos Zork, un asistente conversacional dentro de un chat estilo Slack.
Responde siempre en el mismo idioma del usuario, con ortografia y gramatica correctas.
Tu tono es calido, cercano y con buena onda, como un companero de equipo copado, no como un
manual tecnico. Podes usar alguna expresion coloquial cuando quede natural, mostrar interes
genuino y cerrar con una pregunta o gesto amable cuando tenga sentido.
Escribi en texto plano: NO uses markdown, NO uses asteriscos, NO uses numerales (#),
NO uses negritas ni cursivas, NO uses vinetas con "*" o "-". Si necesitas enumerar algo,
usa oraciones normales o numeros seguidos de un punto (1. 2. 3.).
Se claro y directo respondiendo lo que se te pregunta, pero sin sonar frio ni robotico.`;

// Se agoto la cuota gratuita de TODOS los modelos de la cascada por hoy
export class QuotaExceededError extends Error {
  constructor() {
    super('QUOTA_EXCEEDED');
  }
}

// Orden de intento: el mas generoso en cuota primero, cayendo a los demas si se agota
const MODEL_CASCADE = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
];

const MODEL_LABELS: Record<string, string> = {
  'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
};

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private readonly apiKey: string;

  // Solo avanza hacia adelante cuando un modelo se agota; nunca retrocede
  // (hasta que se reinicie el backend)
  private modelIndex = 0;

  constructor() {
    this.apiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!this.apiKey) {
      console.warn('⚠️  GEMINI_API_KEY no configurado. La integracion con IA no funcionara.');
      return;
    }

    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    console.log('✅ Gemini SDK inicializado');
  }

  isConfigured(): boolean {
    return !!this.ai;
  }

  private sanitize(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^[\*\-\+]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async generateReply(userMessage: string, history: HistoryTurn[] = []): Promise<GeminiReply> {
    if (!this.ai) {
      throw new Error('Gemini no esta configurado. Verifica GEMINI_API_KEY en .env');
    }

    const contents = [
      ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const startIndex = this.modelIndex;

    for (let i = this.modelIndex; i < MODEL_CASCADE.length; i++) {
      const model = MODEL_CASCADE[i];

      try {
        const response = await this.ai.models.generateContent({
          model,
          contents,
          config: { systemInstruction: SYSTEM_PROMPT },
        });

        const raw = response.text || 'No obtuve una respuesta de la IA.';
        const switched = i !== startIndex;
        this.modelIndex = i;

        return {
          text: this.sanitize(raw),
          switchedTo: switched ? (MODEL_LABELS[model] || model) : undefined,
        };
      } catch (error: any) {
        const status = error?.error?.code || error?.status;
        const isQuotaError = status === 429 || error?.error?.status === 'RESOURCE_EXHAUSTED';
        const isModelError = status === 404 || status === 400;

        if (isQuotaError || isModelError) {
          console.warn(`⏳ "${model}" no disponible (${isQuotaError ? 'cuota agotada' : 'modelo no valido'}). Probando el siguiente...`);
          this.modelIndex = i + 1;
          continue;
        }

        console.error('❌ Error llamando a Gemini:', error.message);
        throw error;
      }
    }

    console.error('❌ Se agoto la cuota de todos los modelos gratuitos de Gemini por hoy');
    throw new QuotaExceededError();
  }
}

export default new GeminiService();