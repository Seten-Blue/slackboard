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

  private subscriptions: Subscription[] = [];
  private shouldScrollToBottom = false;

  constructor(
    private chatService: ChatService,
    private socketService: SocketService
  ) {
    this.currentUser = this.chatService.getCurrentUser();
  }

  ngOnInit() {
    this.setupSocketListeners();
    
    // Esperar a que el usuario esté cargado
    setTimeout(() => {
      this.currentUser = this.chatService.getCurrentUser();
      console.log('👤 Usuario actual en message-area:', this.currentUser);
    }, 1000);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
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
      this.socketService.joinChannel(this.channel._id);
    }
  }

  setupSocketListeners() {
    // Escuchar nuevos mensajes
    const newMessageSub = this.socketService.onNewMessage().subscribe((data: any) => {
      if (data.channelId === this.channel?._id) {
        // Verificar si el mensaje ya existe (evitar duplicados)
        const exists = this.messages.some(m => m._id === data.message._id);
        if (!exists) {
          this.messages.push(data.message);
          this.shouldScrollToBottom = true;
        }
      }
    });

    // Escuchar cuando alguien está escribiendo
    const typingSub = this.socketService.onUserTyping().subscribe((data: any) => {
      if (data.channelId === this.channel?._id && data.username !== this.currentUser?.username) {
        this.userTyping = data.username;
        
        // Limpiar después de 3 segundos
        if (this.typingTimeout) {
          clearTimeout(this.typingTimeout);
        }
        this.typingTimeout = setTimeout(() => {
          this.userTyping = null;
        }, 3000);
      }
    });

    this.subscriptions.push(newMessageSub, typingSub);
  }

  loadMessages() {
    if (!this.channel) return;

    this.loading = true;
    this.messages = [];

    this.chatService.getMessagesByChannel(this.channel._id).subscribe({
      next: (response) => {
        this.messages = response.data || [];
        this.loading = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('Error cargando mensajes:', error);
        this.loading = false;
      }
    });
  }

  sendMessage() {
    if (!this.newMessage.trim() || !this.channel) {
      console.warn('⚠️ Mensaje vacío o sin canal');
      return;
    }

    // Verificar que tenemos usuario
    if (!this.currentUser || !this.currentUser._id) {
      console.error('❌ No hay usuario actual configurado');
      alert('Error: No se pudo identificar el usuario. Por favor recarga la página.');
      return;
    }

    const messageData = {
      content: this.newMessage.trim(),
      channel: this.channel._id,
      type: 'text'
    };

    console.log('📨 Intentando enviar mensaje:', messageData);
    console.log('👤 Usuario actual:', this.currentUser);

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        console.log('✅ Mensaje enviado exitosamente:', response);
        
        // Agregar el mensaje a la lista local solo si no existe
        const exists = this.messages.some(m => m._id === response.data._id);
        if (!exists) {
          this.messages.push(response.data);
        }
        
        // Emitir a través de Socket.IO
        this.socketService.sendMessage({
          channelId: this.channel._id,
          message: response.data
        });

        // Limpiar input y scroll
        this.newMessage = '';
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('❌ Error enviando mensaje:', error);
        console.error('Detalles del error:', error.error);
        
        let errorMessage = 'Error al enviar el mensaje';
        if (error.status === 404) {
          errorMessage = 'Error: Canal o usuario no encontrado';
        } else if (error.error && error.error.message) {
          errorMessage = error.error.message;
        }
        
        alert(errorMessage);
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
    if (!this.channel || !this.currentUser) return;

    // Notificar que el usuario está escribiendo
    this.socketService.sendTyping({
      channelId: this.channel._id,
      username: this.currentUser.username
    });
  }

  addReaction(messageId: string, emoji: string) {
    this.chatService.addReaction(messageId, emoji).subscribe({
      next: (response) => {
        // Actualizar el mensaje en la lista
        const index = this.messages.findIndex(m => m._id === messageId);
        if (index !== -1) {
          this.messages[index] = response.data;
        }
      },
      error: (error) => {
        console.error('Error agregando reacción:', error);
      }
    });
  }

  formatTime(timestamp: string): string {
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
      console.error('Error scrolling:', err);
    }
  }
}