import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import AiConversation from '../models/AiConversation';

dotenv.config();

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ GEMINI_API_KEY no configurada');
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // ✅ CORREGIDO: Usar modelo correcto
      this.model = this.genAI.getGenerativeModel({model: 'gemini-1.5-flash'

      });
      console.log('✅ Gemini AI inicializado correctamente con gemini-pro');
    } catch (error: any) {
      console.error('❌ Error inicializando Gemini:', error.message);
    }
  }

  isConfigured(): boolean {
    return this.genAI !== null && this.model !== null;
  }

  async chat(
    userId: string,
    userMessage: string,
    channelId?: string,
    conversationHistory?: any[]
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      // Construir contexto de la conversación
      let conversationContext = '';
      if (conversationHistory && conversationHistory.length > 0) {
        conversationContext = conversationHistory
          .slice(-10) // Solo últimos 10 mensajes para no exceder límites
          .map((msg: any) => `${msg.role}: ${msg.content}`)
          .join('\n');
      }

      // Prompt mejorado con contexto
      const prompt = conversationContext
        ? `Historial de conversación:\n${conversationContext}\n\nUsuario: ${userMessage}\n\nAsistente:`
        : userMessage;

      // Generar respuesta
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Guardar conversación en la base de datos
      await this.saveConversation(userId, userMessage, text, channelId);

      return text;
    } catch (error: any) {
      console.error('❌ Error en Gemini chat:', error.message);
      throw new Error(`Error generando respuesta: ${error.message}`);
    }
  }

  async summarizeText(text: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      const prompt = `Resume el siguiente texto de manera concisa y clara:\n\n${text}`;
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error('❌ Error resumiendo texto:', error.message);
      throw new Error(`Error resumiendo: ${error.message}`);
    }
  }

  async analyzeMessage(message: string): Promise<{
    sentiment: string;
    topics: string[];
    summary: string;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      const prompt = `Analiza el siguiente mensaje y responde en formato JSON con:
      - sentiment: (positivo, negativo, neutral)
      - topics: array de temas principales
      - summary: resumen breve
      
      Mensaje: "${message}"
      
      Responde SOLO con JSON válido, sin markdown ni código.`;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      
      // Limpiar respuesta para obtener JSON
      const cleanText = text.replace(/```json|```/g, '').trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return {
        sentiment: 'neutral',
        topics: [],
        summary: text,
      };
    } catch (error: any) {
      console.error('❌ Error analizando mensaje:', error.message);
      return {
        sentiment: 'neutral',
        topics: [],
        summary: message,
      };
    }
  }

  async generateChannelSummary(channelId: string, messages: any[]): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Gemini AI no está configurado');
    }

    try {
      // Limitar mensajes para no exceder límites de tokens
      const recentMessages = messages.slice(-50);
      
      const messagesText = recentMessages
        .map((msg: any) => `${msg.sender?.username || 'Usuario'}: ${msg.content}`)
        .join('\n');

      const prompt = `Resume la siguiente conversación de un canal de chat, destacando los puntos más importantes y las decisiones tomadas:\n\n${messagesText}`;

      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error: any) {
      console.error('❌ Error generando resumen:', error.message);
      throw new Error(`Error generando resumen: ${error.message}`);
    }
  }

  private async saveConversation(
    userId: string,
    userMessage: string,
    assistantMessage: string,
    channelId?: string
  ) {
    try {
      // ✅ CORREGIDO: No usar userId como ObjectId si es string
      const conversation = await AiConversation.findOne({ 
        userId: userId as any // Permitir string temporal
      });

      if (conversation) {
        // Agregar mensajes a conversación existente
        conversation.messages.push(
          {
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
          },
          {
            role: 'assistant',
            content: assistantMessage,
            timestamp: new Date(),
          }
        );

        // Limitar historial a últimos 20 mensajes
        if (conversation.messages.length > 20) {
          conversation.messages = conversation.messages.slice(-20);
        }

        await conversation.save();
      } else {
        // Crear nueva conversación - solo si userId es ObjectId válido
        try {
          await AiConversation.create({
            userId: userId as any,
            channelId,
            messages: [
              {
                role: 'user',
                content: userMessage,
                timestamp: new Date(),
              },
              {
                role: 'assistant',
                content: assistantMessage,
                timestamp: new Date(),
              },
            ],
          });
        } catch (createError: any) {
          console.warn('⚠️ No se pudo crear conversación (userId inválido):', createError.message);
          // Continuar sin guardar - no es crítico
        }
      }
    } catch (error: any) {
      console.error('❌ Error guardando conversación:', error.message);
      // No lanzar error - permitir que el chat continúe
    }
  }

  async getConversationHistory(userId: string): Promise<any[]> {
    try {
      const conversation = await AiConversation.findOne({ userId: userId as any });
      return conversation?.messages || [];
    } catch (error: any) {
      console.error('❌ Error obteniendo historial:', error.message);
      return [];
    }
  }

  async clearConversationHistory(userId: string): Promise<void> {
    try {
      await AiConversation.deleteOne({ userId: userId as any });
    } catch (error: any) {
      console.error('❌ Error limpiando historial:', error.message);
    }
  }
}

export default new GeminiService();