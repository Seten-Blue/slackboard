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
      if (data.channelId === this.channel?._id) {
        const exists = this.messages.some(m => m._id === data.message._id);
        if (!exists) {
          this.messages.push(data.message);
          this.shouldScrollToBottom = true;
        }
      }
    });

    const typingSub = this.socketService.onUserTyping().subscribe((data: any) => {
      if (data.channelId === this.channel?._id && data.username !== this.currentUser.username) {
        this.userTyping = data.username;

        if (this.typingTimeout) {
          clearTimeout(this.typingTimeout);
        }
        this.typingTimeout = setTimeout(() => {
          this.userTyping = null;
        }, 3000);
      }
    });

    // ← NUEVO: alguien editó un mensaje desde una plataforma externa (Discord por ahora)
    const updatedSub = this.socketService.onMessageUpdated().subscribe((data: any) => {
      const index = this.messages.findIndex(m => m._id === data.messageId);
      if (index !== -1) {
        this.messages[index] = {
          ...this.messages[index],
          content: data.content,
          isEdited: true
        };
      }
    });

    // ← NUEVO: alguien borró un mensaje desde una plataforma externa
    const deletedSub = this.socketService.onMessageDeleted().subscribe((data: any) => {
      this.messages = this.messages.filter(m => m._id !== data.messageId);
    });

    // ← NUEVO: se agregó/quitó una reacción desde una plataforma externa
    const reactionSub = this.socketService.onMessageReaction().subscribe((data: any) => {
      const index = this.messages.findIndex(m => m._id === data.messageId);
      if (index !== -1) {
        this.messages[index] = {
          ...this.messages[index],
          reactions: data.reactions
        };
      }
    });

    this.subscriptions.push(newMessageSub, typingSub, updatedSub, deletedSub, reactionSub);
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

    const messageData = {
      content: this.newMessage.trim(),
      channel: this.channel._id,
      type: 'text'
    };

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        this.messages.push(response.data);

        this.socketService.sendMessage({
          channelId: this.channel._id,
          message: response.data
        });

        this.newMessage = '';
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('Error enviando mensaje:', error);
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
    if (!this.channel) return;

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

  // ← NUEVO: agrupa mensajes consecutivos del mismo usuario (misma lógica que Discord/Linear)
  shouldGroupWithPrevious(index: number): boolean {
    if (index === 0) return false;
    const current = this.messages[index];
    const previous = this.messages[index - 1];
    if (!current || !previous) return false;
    if (current.sender?._id !== previous.sender?._id) return false;

    const currentTime = new Date(current.createdAt).getTime();
    const previousTime = new Date(previous.createdAt).getTime();
    return (currentTime - previousTime) < 5 * 60 * 1000; // 5 minutos
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