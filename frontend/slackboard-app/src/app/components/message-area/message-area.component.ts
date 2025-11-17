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
    
    setTimeout(() => {
      this.currentUser = this.chatService.getCurrentUser();
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
    const newMessageSub = this.socketService.onNewMessage().subscribe((data: any) => {
      console.log('🔔 Mensaje recibido por Socket.IO:', data);
      
      if (data.channelId === this.channel?._id) {
        const exists = this.messages.some(m => m._id === data.message._id);
        if (!exists) {
          console.log('➕ Agregando mensaje');
          this.messages.push(data.message);
          this.shouldScrollToBottom = true;
        }
      }
    });

    const typingSub = this.socketService.onUserTyping().subscribe((data: any) => {
      if (data.channelId === this.channel?._id && data.username !== this.currentUser?.username) {
        this.userTyping = data.username;
        
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
    if (!this.newMessage.trim() || !this.channel) return;

    if (!this.currentUser || !this.currentUser._id) {
      alert('Error: No se pudo identificar el usuario');
      return;
    }

    const messageData = {
      content: this.newMessage.trim(),
      channel: this.channel._id,
      type: 'text'
    };

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        console.log('✅ Mensaje enviado:', response);
        
        this.socketService.sendMessage({
          channelId: this.channel._id,
          message: response.data
        });

        this.newMessage = '';
      },
      error: (error) => {
        console.error('❌ Error:', error);
        alert('Error al enviar el mensaje');
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

    this.socketService.sendTyping({
      channelId: this.channel._id,
      username: this.currentUser.username
    });
  }

  addReaction(messageId: string, emoji: string) {
    this.chatService.addReaction(messageId, emoji).subscribe({
      next: (response) => {
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
    } catch (err) {}
  }
}