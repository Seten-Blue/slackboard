import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, OnChanges } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-message-area',
  templateUrl: './message-area.component.html',
  styleUrls: ['./message-area.component.scss']
})
export class MessageAreaComponent implements OnInit, OnDestroy, AfterViewChecked, OnChanges {
  @Input() channel: any;
  @ViewChild('messageContainer') messageContainer!: ElementRef;

  messages: any[] = [];
  newMessage = '';
  loading = false;
  userTyping: string | null = null;
  typingTimeout: any;
  currentUser: any;
  isTyping = false;

  private subscriptions: Subscription[] = [];
  private shouldScrollToBottom = false;
  private userTypingTimeout: any;

  constructor(
    private chatService: ChatService,
    private socketService: SocketService
  ) {
    this.currentUser = this.chatService.getCurrentUser();
  }

  ngOnInit() {
    this.setupSocketListeners();
    
    setTimeout(() => {
      this.currentUser = this.chatService.getCurrentUser();
      console.log('👤 Usuario actual:', this.currentUser);
    }, 1000);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    if (this.userTypingTimeout) {
      clearTimeout(this.userTypingTimeout);
    }

    // Salir del canal actual
    if (this.channel) {
      this.socketService.leaveChannel(this.channel._id);
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnChanges() {
    if (this.channel) {
      this.loadMessages();
      
      // Unirse al nuevo canal
      if (this.socketService.isConnected()) {
        this.socketService.joinChannel(this.channel._id);
        console.log('✅ Unido al canal:', this.channel.name);
      }
    }
  }

  setupSocketListeners() {
    // Escuchar nuevos mensajes
    const newMessageSub = this.socketService.onNewMessage().subscribe((data: any) => {
      console.log('🔔 Mensaje recibido por Socket.IO:', data);
      
      // Verificar si el mensaje es del canal actual
      const messageChannelId = data.channel || data.channelId || data.message?.channel;
      
      if (messageChannelId === this.channel?._id) {
        // Obtener el mensaje correcto del objeto de datos
        const message = data.message || data;
        
        const exists = this.messages.some(m => m._id === message._id);
        if (!exists) {
          console.log('➕ Agregando mensaje a la lista');
          this.messages.push(message);
          this.shouldScrollToBottom = true;
        } else {
          console.log('⚠️ Mensaje duplicado ignorado');
        }
      }
    });

    // Escuchar usuario escribiendo
    const typingSub = this.socketService.onUserTyping().subscribe((data: any) => {
      console.log('⌨️ Usuario escribiendo:', data);
      
      if (data.channelId === this.channel?._id && data.userId !== this.currentUser?._id) {
        this.userTyping = data.username;
        
        // Limpiar timeout anterior
        if (this.userTypingTimeout) {
          clearTimeout(this.userTypingTimeout);
        }
        
        // Ocultar después de 3 segundos
        this.userTypingTimeout = setTimeout(() => {
          this.userTyping = null;
        }, 3000);
      }
    });

    // Escuchar usuario dejó de escribir
    const stopTypingSub = this.socketService.onUserStopTyping().subscribe((data: any) => {
      if (data.channelId === this.channel?._id && data.userId !== this.currentUser?._id) {
        this.userTyping = null;
      }
    });

    this.subscriptions.push(newMessageSub, typingSub, stopTypingSub);
  }

  loadMessages() {
    if (!this.channel) return;

    this.loading = true;
    this.messages = [];

    this.chatService.getMessagesByChannel(this.channel._id).subscribe({
      next: (response) => {
        console.log('📥 Mensajes cargados:', response);
        this.messages = response.data || [];
        this.loading = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('❌ Error cargando mensajes:', error);
        this.loading = false;
      }
    });
  }

  sendMessage() {
    if (!this.newMessage.trim() || !this.channel) return;

    if (!this.currentUser || !this.currentUser._id) {
      alert('Error: No se pudo identificar el usuario. Por favor recarga la página.');
      console.error('❌ currentUser no está definido:', this.currentUser);
      return;
    }

    const messageData = {
      content: this.newMessage.trim(),
      channel: this.channel._id,
      sender: this.currentUser._id, // Agregar sender
      type: 'text'
    };

    console.log('📤 Enviando mensaje:', messageData);

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        console.log('✅ Mensaje enviado exitosamente:', response);
        
        // Limpiar el input
        this.newMessage = '';
        
        // Detener indicador de escritura
        if (this.isTyping) {
          this.isTyping = false;
          this.socketService.sendStopTyping(this.channel._id, this.currentUser._id);
        }

        // El mensaje se agregará automáticamente vía Socket.IO
        // No es necesario agregarlo manualmente aquí
      },
      error: (error) => {
        console.error('❌ Error enviando mensaje:', error);
        alert('Error al enviar el mensaje. Por favor intenta de nuevo.');
      }
    });
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onTyping() {
    if (!this.channel || !this.currentUser || !this.currentUser._id) {
      return;
    }

    // Solo emitir si no estamos ya escribiendo
    if (!this.isTyping && this.newMessage.trim().length > 0) {
      this.isTyping = true;
      
      // ✅ CORRECCIÓN: Pasar los 3 argumentos correctamente
      this.socketService.sendTyping(
        this.channel._id,
        this.currentUser._id,
        this.currentUser.username || 'Usuario'
      );
      
      console.log('⌨️ Emitiendo evento de escritura');
    }

    // Limpiar timeout anterior
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Después de 2 segundos sin escribir, emitir stop typing
    this.typingTimeout = setTimeout(() => {
      if (this.isTyping) {
        this.isTyping = false;
        this.socketService.sendStopTyping(this.channel._id, this.currentUser._id);
        console.log('⏹️ Deteniendo indicador de escritura');
      }
    }, 2000);
  }

  addReaction(messageId: string, emoji: string) {
    if (!this.currentUser || !this.currentUser._id) {
      console.error('❌ No se puede agregar reacción: usuario no identificado');
      return;
    }

    this.chatService.addReaction(messageId, emoji, this.currentUser._id).subscribe({
      next: (response) => {
        console.log('✅ Reacción agregada:', response);
        
        // Actualizar el mensaje en la lista
        const index = this.messages.findIndex(m => m._id === messageId);
        if (index !== -1) {
          this.messages[index] = response.data;
        }
      },
      error: (error) => {
        console.error('❌ Error agregando reacción:', error);
      }
    });
  }

  formatTime(timestamp: string): string {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `hace ${minutes}m`;
    if (hours < 24) return `hace ${hours}h`;
    if (days < 7) return `hace ${days}d`;
    
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private scrollToBottom(): void {
    try {
      if (this.messageContainer) {
        const element = this.messageContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error al hacer scroll:', err);
    }
  }
}