import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import AiConversation from '../models/AiConversation';
import mongoose from 'mongoose';

dotenv.config();

// Modelos disponibles de Gemini (actualizados según tu API Key)
export const GEMINI_MODELS = {
  'gemini-2.5-flash': {
    name: 'Gemini 2.5 Flash',
    description: 'Modelo multimodal de última generación (Stable, Junio 2025)',
    speed: 'Muy rápido',
    capabilities: 'Excelente'
  },
  'gemini-2.5-pro': {
    name: 'Gemini 2.5 Pro',
    description: 'Modelo avanzado con mejor razonamiento (Stable, Junio 2025)',
    speed: 'Medio',
    capabilities: 'Excepcional'
  },
  'gemini-2.0-flash': {
    name: 'Gemini 2.0 Flash',
    description: 'Modelo rápido y eficiente',
    speed: 'Muy rápido',
    capabilities: 'Excelente'
  },
  'gemini-2.0-flash-lite': {
    name: 'Gemini 2.0 Flash Lite',
    description: 'Versión optimizada ultra-rápida',
    speed: 'Extremadamente rápido',
    capabilities: 'Muy buena'
  }
};

// Orden de prioridad de modelos (de más moderno a más antiguo)
const MODEL_FALLBACK_ORDER = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite'
];

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private models: Map<string, any> = new Map();
  private currentModel: string = 'gemini-2.0-flash-exp';
  private availableModels: string[] = [];

  constructor() {
    this.initialize();
  }

  private initialize() {
    console.log(`🔑 GEMINI_API_KEY: ${process.env.GEMINI_API_KEY?.slice(0,6)}...`);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY no configurada');
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);

      // Inicializar modelos en orden de prioridad
      MODEL_FALLBACK_ORDER.forEach(modelName => {
        try {
          const model = this.genAI!.getGenerativeModel({ model: modelName });
          this.models.set(modelName, model);
          this.availableModels.push(modelName);
        } catch (error) {
          console.warn(`⚠️ No se pudo cargar el modelo ${modelName}`);
        }
      });

      console.log(`🧠 Modelos inicializados: ${this.availableModels.join(', ')}`);

      // Establecer modelo por defecto
      let defaultModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
      if (!this.models.has(defaultModel)) {
        const firstAvailable = this.availableModels[0];
        if (firstAvailable) {
          defaultModel = firstAvailable;
          console.warn(`⚠️ Modelo '${process.env.GEMINI_MODEL}' no disponible. Usando '${defaultModel}'`);
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
    
    if (this.models.has(targetModel)) {
      return this.models.get(targetModel);
    }

    // Fallback: usar el primer modelo disponible
    const firstModel = this.models.get(this.availableModels[0]);
    if (firstModel) {
      console.warn(`⚠️ Usando ${this.availableModels[0]} como fallback`);
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

    // Intentar con todos los modelos disponibles en orden
    const modelsToTry = modelName 
      ? [modelName, ...this.availableModels.filter(m => m !== modelName)]
      : this.availableModels;

    let lastError: any = null;

    for (const currentModelName of modelsToTry) {
      try {
        const model = this.models.get(currentModelName);
        if (!model) continue;

        console.log(`🤖 [${currentModelName}] Generando respuesta para:`, userMessage.substring(0, 50));

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

        console.log(`✅ [${currentModelName}] Respuesta generada exitosamente`);

        // Guardar conversación
        await this.saveConversation(userId, userMessage, text, channelId, currentModelName);

        return {
          response: text,
          model: currentModelName
        };
      } catch (error: any) {
        console.warn(`⚠️ [${currentModelName}] Falló:`, error.message);
        lastError = error;
        // Continuar con el siguiente modelo
        continue;
      }
    }

    // Si todos los modelos fallaron
    console.error('❌ Todos los modelos fallaron');
    throw new Error(`Error generando respuesta: ${lastError?.message || 'Todos los modelos fallaron'}`);
  }

  async summarizeText(text: string, modelName?: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    const modelsToTry = modelName 
      ? [modelName, ...this.availableModels.filter(m => m !== modelName)]
      : this.availableModels;

    for (const currentModelName of modelsToTry) {
      try {
        const model = this.models.get(currentModelName);
        if (!model) continue;

        const prompt = `Resume el siguiente texto de manera concisa:\n\n${text}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error: any) {
        console.warn(`⚠️ [${currentModelName}] Falló en resumen:`, error.message);
        continue;
      }
    }

    throw new Error('Error resumiendo: Todos los modelos fallaron');
  }

  async analyzeMessage(message: string, modelName?: string): Promise<{
    sentiment: string;
    topics: string[];
    summary: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    const modelsToTry = modelName 
      ? [modelName, ...this.availableModels.filter(m => m !== modelName)]
      : this.availableModels;

    for (const currentModelName of modelsToTry) {
      try {
        const model = this.models.get(currentModelName);
        if (!model) continue;

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
        console.warn(`⚠️ [${currentModelName}] Falló en análisis:`, error.message);
        continue;
      }
    }

    return {
      sentiment: 'neutral',
      topics: ['error'],
      summary: message,
    };
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

    const modelsToTry = modelName 
      ? [modelName, ...this.availableModels.filter(m => m !== modelName)]
      : this.availableModels;

    for (const currentModelName of modelsToTry) {
      try {
        const model = this.models.get(currentModelName);
        if (!model) continue;

        const messagesText = messages
          .slice(-20)
          .map((msg: any) => `${msg.sender?.username || 'Usuario'}: ${msg.content}`)
          .join('\n');

        const prompt = `Resume esta conversación destacando los puntos clave:\n\n${messagesText}`;
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (error: any) {
        console.warn(`⚠️ [${currentModelName}] Falló en resumen de canal:`, error.message);
        continue;
      }
    }

    throw new Error('Error generando resumen: Todos los modelos fallaron');
  }

  private async saveConversation(
    userId: string,
    userMessage: string,
    assistantMessage: string,
    channelId?: string,
    model?: string
  ) {
    try {
      // Validar que userId sea un ObjectId válido
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.warn('⚠️ userId no es un ObjectId válido:', userId);
        return;
      }

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
          userId: new mongoose.Types.ObjectId(userId),
          channelId: channelId ? new mongoose.Types.ObjectId(channelId) : undefined,
          messages: [userMsg, assistantMsg],
          context: model ? `Usando modelo: ${model}` : undefined
        });
      }
      
      console.log('✅ Conversación guardada correctamente');
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