import { Component, OnInit } from '@angular/core';
import { 
  GeminiService, 
  ChatResponse, 
  AnalysisResponse 
} from '../../services/gemini.service';
import { ChatService } from '../../services/chat.service'; // ✅ AGREGAR

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface StatusResponse {
  configured: boolean;
}

@Component({
  selector: 'app-gemini-chat',
  templateUrl: './gemini-chat.component.html',
  styleUrls: ['./gemini-chat.component.scss']
})
export class GeminiChatComponent implements OnInit {
  messages: Message[] = [];
  userMessage = '';
  isLoading = false;
  isConfigured = false;
  currentUserId: string = ''; // ✅ CAMBIO: ya no hardcodeado

  showAnalysis = false;
  analysisResult: any = null;
  analyzingMessage = '';

  constructor(
    private geminiService: GeminiService,
    private chatService: ChatService // ✅ INYECTAR ChatService
  ) {
    // ✅ OBTENER USUARIO REAL
    const currentUser = this.chatService.getCurrentUser();
    this.currentUserId = currentUser?._id || '673fcbc3f51cfaa6ea90f8b8'; // ID admin por defecto
    console.log('👤 Usuario para Gemini:', this.currentUserId);
  }

  ngOnInit() {
    this.checkStatus();
    this.loadHistory();
  }

  checkStatus() {
    this.geminiService.getStatus().subscribe({
      next: (response: StatusResponse) => {
        this.isConfigured = response.configured;
        if (!this.isConfigured) {
          this.messages.push({
            role: 'assistant',
            content: '⚠️ Gemini AI no está configurado. Por favor verifica la API Key en el backend.',
            timestamp: new Date()
          });
        }
      },
      error: (error: any) => {
        console.error('Error verificando estado:', error);
      }
    });
  }

  loadHistory() {
    this.messages = [
      {
        role: 'assistant',
        content: '¡Hola! Soy tu asistente de IA Gemini. ¿En qué puedo ayudarte hoy?',
        timestamp: new Date()
      }
    ];
  }

  sendMessage() {
    if (!this.userMessage.trim() || this.isLoading) return;

    const userMsg: Message = {
      role: 'user',
      content: this.userMessage,
      timestamp: new Date()
    };

    this.messages.push(userMsg);
    const messageToSend = this.userMessage;
    this.userMessage = '';
    this.isLoading = true;

    this.geminiService.chat(this.currentUserId, messageToSend).subscribe({
      next: (response: ChatResponse) => {
        this.messages.push({
          role: 'assistant',
          content: response.data.message,
          timestamp: new Date()
        });
        this.isLoading = false;
        this.scrollToBottom();
      },
      error: (error: any) => {
        console.error('Error enviando mensaje:', error);
        this.messages.push({
          role: 'assistant',
          content: '❌ Error al generar respuesta. Por favor intenta de nuevo.',
          timestamp: new Date()
        });
        this.isLoading = false;
      }
    });
  }

  analyzeMessage() {
    if (!this.analyzingMessage.trim() || this.isLoading) return;

    this.isLoading = true;
    this.showAnalysis = true;

    this.geminiService.analyzeMessage(this.analyzingMessage).subscribe({
      next: (response: AnalysisResponse) => {
        this.analysisResult = response.data;
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Error analizando mensaje:', error);
        this.isLoading = false;
        this.showAnalysis = false;
      }
    });
  }

  clearHistory() {
    if (confirm('¿Estás seguro de que quieres limpiar el historial?')) {
      this.geminiService.clearHistory(this.currentUserId).subscribe({
        next: () => {
          this.messages = [
            {
              role: 'assistant',
              content: '✅ Historial limpiado. ¿En qué puedo ayudarte?',
              timestamp: new Date()
            }
          ];
        },
        error: (error: any) => {
          console.error('Error limpiando historial:', error);
        }
      });
    }
  }

  closeAnalysis() {
    this.showAnalysis = false;
    this.analysisResult = null;
    this.analyzingMessage = '';
  }

  getSentimentColor(sentiment: string): string {
    const colors: any = {
      'positivo': 'text-green-600',
      'negativo': 'text-red-600',
      'neutral': 'text-gray-600'
    };
    return colors[sentiment] || 'text-gray-600';
  }

  getSentimentEmoji(sentiment: string): string {
    const emojis: any = {
      'positivo': '😊',
      'negativo': '😔',
      'neutral': '😐'
    };
    return emojis[sentiment] || '😐';
  }

  private scrollToBottom() {
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-messages');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);
  }
}