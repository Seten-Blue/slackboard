import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import AiConversation from '../models/AiConversation';

dotenv.config();

// Modelos disponibles de Gemini
export const GEMINI_MODELS = {
  'gemini-pro': {
    name: 'Gemini Pro',
    description: 'Modelo estándar, rápido y confiable',
    speed: 'Rápido',
    capabilities: 'Buena'
  },
  'gemini-1.5-pro-latest': {
    name: 'Gemini 1.5 Pro',
    description: 'Modelo avanzado con mejor razonamiento',
    speed: 'Medio',
    capabilities: 'Excelente'
  },
  'gemini-1.5-flash-latest': {
    name: 'Gemini 1.5 Flash',
    description: 'Respuestas ultrarrápidas',
    speed: 'Muy rápido',
    capabilities: 'Buena'
  },
  'gemini-1.0-pro': {
    name: 'Gemini 1.0 Pro',
    description: 'Modelo básico compatible',
    speed: 'Rápido',
    capabilities: 'Estándar'
  }
};

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private models: Map<string, any> = new Map();
  private currentModel: string = 'gemini-pro';

  constructor() {
    this.initialize();
  }

  private initialize() {
  // Log para depuración: mostrar API Key (solo los primeros 6 caracteres)
  console.log(`🔑 GEMINI_API_KEY: ${process.env.GEMINI_API_KEY?.slice(0,6)}...`);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY no configurada');
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);

      // Inicializar todos los modelos disponibles
      // Inicializar todos los modelos disponibles y loggear los que se inicializan correctamente
      const initializedModels: string[] = [];
      Object.keys(GEMINI_MODELS).forEach(modelName => {
        try {
          const model = this.genAI!.getGenerativeModel({ model: modelName });
          this.models.set(modelName, model);
          initializedModels.push(modelName);
        } catch (error) {
          console.warn(`⚠️ No se pudo cargar el modelo ${modelName}`);
        }
      });

      console.log(`🧠 Modelos inicializados: ${initializedModels.length > 0 ? initializedModels.join(', ') : 'Ninguno'}`);

      // Usar el modelo por defecto del .env o gemini-pro
    let defaultModel = process.env.GEMINI_MODEL || 'gemini-pro';
    if (!this.models.has(defaultModel)) {
      // Si el modelo por defecto no está disponible, usar el primero disponible
      const firstAvailable = Array.from(this.models.keys())[0];
      if (firstAvailable) {
        defaultModel = firstAvailable;
        console.warn(`⚠️ Modelo '${process.env.GEMINI_MODEL || 'gemini-pro'}' no disponible. Usando '${defaultModel}' como modelo actual.`);
      } else {
        console.error('❌ No hay modelos de Gemini disponibles.');
        return;
      }
    }
    this.currentModel = defaultModel;

    console.log(`✅ Gemini AI inicializado con ${this.models.size} modelos disponibles`);
    console.log(`📌 Modelo actual: ${this.currentModel}`);
    } catch (error: any) {
      console.error('❌ Error inicializando Gemini:', error.message);
    }
  }

  isConfigured(): boolean {
    return this.genAI !== null && this.models.size > 0;
  }

  getAvailableModels(): typeof GEMINI_MODELS {
    return GEMINI_MODELS;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setCurrentModel(modelName: string): boolean {
    if (this.models.has(modelName)) {
      this.currentModel = modelName;
      console.log(`✅ Modelo cambiado a: ${modelName}`);
      return true;
    }
    console.warn(`⚠️ Modelo ${modelName} no está disponible`);
    return false;
  }

  private getModel(modelName?: string): any {
    const targetModel = modelName || this.currentModel;
    
    // Intentar con el modelo solicitado
    if (this.models.has(targetModel)) {
      return this.models.get(targetModel);
    }

    // Fallback: intentar con gemini-pro
    if (this.models.has('gemini-pro')) {
      console.warn(`⚠️ Usando gemini-pro como fallback`);
      return this.models.get('gemini-pro');
    }

    // Usar el primer modelo disponible
    const firstModel = Array.from(this.models.values())[0];
    if (firstModel) {
      console.warn(`⚠️ Usando primer modelo disponible como fallback`);
      return firstModel;
    }

    throw new Error('No hay modelos de Gemini disponibles');
  }

  async chat(
    userId: string,
    userMessage: string,
    channelId?: string,
    conversationHistory?: any[],
    modelName?: string
  ): Promise<{ response: string; model: string }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      const model = this.getModel(modelName);
      const usedModel = modelName || this.currentModel;

      console.log(`🤖 [${usedModel}] Generando respuesta para:`, userMessage.substring(0, 50));

      // Construir prompt con historial si existe
      let prompt = userMessage;
      if (conversationHistory && conversationHistory.length > 0) {
        const context = conversationHistory
          .slice(-5)
          .map((msg: any) => `${msg.role}: ${msg.content}`)
          .join('\n');
        prompt = `${context}\nuser: ${userMessage}`;
      }

      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      console.log(`✅ [${usedModel}] Respuesta generada exitosamente`);

      // Guardar conversación
      await this.saveConversation(userId, userMessage, text, channelId, usedModel);

      return {
        response: text,
        model: usedModel
      };
    } catch (error: any) {
      console.error('❌ Error en Gemini chat:', error);
      
      // Si falla, intentar con modelo de fallback
      if (modelName && modelName !== 'gemini-pro') {
        console.log('🔄 Reintentando con gemini-pro...');
        return this.chat(userId, userMessage, channelId, conversationHistory, 'gemini-pro');
      }
      
      throw new Error(`Error generando respuesta: ${error.message}`);
    }
  }

  async summarizeText(text: string, modelName?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      const model = this.getModel(modelName);
      const prompt = `Resume el siguiente texto de manera concisa:\n\n${text}`;
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error('❌ Error resumiendo:', error.message);
      throw new Error(`Error resumiendo: ${error.message}`);
    }
  }

  async analyzeMessage(message: string, modelName?: string): Promise<{
    sentiment: string;
    topics: string[];
    summary: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      const model = this.getModel(modelName);
      const prompt = `Analiza este mensaje y responde SOLO con JSON:
{
  "sentiment": "positivo/negativo/neutral",
  "topics": ["tema1", "tema2"],
  "summary": "resumen breve"
}

Mensaje: "${message}"`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      
      try {
        const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleanJson);
      } catch {
        return {
          sentiment: 'neutral',
          topics: ['general'],
          summary: text,
        };
      }
    } catch (error: any) {
      console.error('❌ Error analizando:', error.message);
      return {
        sentiment: 'neutral',
        topics: ['error'],
        summary: message,
      };
    }
  }

  async generateChannelSummary(
    channelId: string, 
    messages: any[], 
    modelName?: string
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    if (messages.length === 0) {
      return 'No hay mensajes para resumir.';
    }

    try {
      const model = this.getModel(modelName);
      const messagesText = messages
        .slice(-20)
        .map((msg: any) => `${msg.sender?.username || 'Usuario'}: ${msg.content}`)
        .join('\n');

      const prompt = `Resume esta conversación destacando los puntos clave:\n\n${messagesText}`;
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error('❌ Error generando resumen:', error.message);
      throw new Error(`Error: ${error.message}`);
    }
  }

  private async saveConversation(
    userId: string,
    userMessage: string,
    assistantMessage: string,
    channelId?: string,
    model?: string
  ) {
    try {
      let conversation = await AiConversation.findOne({ userId });

      const userMsg = {
        role: 'user' as const,
        content: userMessage,
        timestamp: new Date()
      };

      const assistantMsg = {
        role: 'assistant' as const,
        content: assistantMessage,
        timestamp: new Date()
      };

      if (conversation) {
        conversation.messages.push(userMsg, assistantMsg);

        if (conversation.messages.length > 20) {
          conversation.messages = conversation.messages.slice(-20);
        }

        if (model) {
          conversation.context = `Usando modelo: ${model}`;
        }

        await conversation.save();
      } else {
        await AiConversation.create({
          userId,
          channelId,
          messages: [userMsg, assistantMsg],
          context: model ? `Usando modelo: ${model}` : undefined
        });
      }
    } catch (error: any) {
      console.error('❌ Error guardando conversación:', error.message);
    }
  }

  async getConversationHistory(userId: string): Promise<any[]> {
    try {
      const conversation = await AiConversation.findOne({ userId });
      return conversation?.messages || [];
    } catch (error: any) {
      console.error('❌ Error obteniendo historial:', error.message);
      return [];
    }
  }

  async clearConversationHistory(userId: string): Promise<void> {
    try {
      await AiConversation.deleteOne({ userId });
      console.log('✅ Historial limpiado para:', userId);
    } catch (error: any) {
      console.error('❌ Error limpiando historial:', error.message);
    }
  }
}

export default new GeminiService();
