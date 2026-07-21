import { Component, OnInit, OnDestroy, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { io, Socket } from 'socket.io-client';

interface AIMessage {
  _id?: string;
  content: string;
  sender: any;
  createdAt?: string;
}

@Component({
  selector: 'app-ai-chat',
  templateUrl: './ai-chat.component.html',
  styleUrls: ['./ai-chat.component.scss']
})
export class AiChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  channel: any = null;
  messages: AIMessage[] = [];
  newMessage = '';
  loading = true;
  sending = false;
  thinking = false;
  errorMsg: string | null = null;

  private socket!: Socket;
  private shouldScroll = false;

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    this.chatService.getOrCreateAIChannel().subscribe({
      next: (response: any) => {
        this.channel = response.data;
        this.loadMessages();
        this.connectSocket();
        this.chatService.triggerChannelsRefresh();
      },
      error: () => {
        this.errorMsg = 'No se pudo conectar con Zork. Verifica que el backend este corriendo.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.socket?.disconnect();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private loadMessages(): void {
    this.loading = true;
    this.chatService.getMessagesByChannel(this.channel._id).subscribe({
      next: (response: any) => {
        this.messages = response.data || [];
        this.loading = false;
        this.shouldScroll = true;
      },
      error: () => {
        this.errorMsg = 'No se pudieron cargar los mensajes.';
        this.loading = false;
      }
    });
  }

  private connectSocket(): void {
    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      this.socket.emit('join-channel', this.channel._id);
    });

    this.socket.on('new-message', (data: any) => {
      if (data.channelId === this.channel._id) {
        this.addMessageIfNew(data.message);
        this.thinking = false;
      }
    });
  }

  private addMessageIfNew(msg: AIMessage): void {
    if (msg._id && this.messages.some(m => m._id === msg._id)) {
      return;
    }
    this.messages.push(msg);
    this.shouldScroll = true;
  }

  isAIMessage(msg: AIMessage): boolean {
    return msg.sender?.email === 'ai@slackboard.com';
  }

  sendMessage(): void {
    const trimmed = this.newMessage.trim();
    if (!trimmed || this.sending) return;

    this.sending = true;

    this.chatService.sendMessage({
      content: trimmed,
      channel: this.channel._id,
      type: 'text'
    }).subscribe({
      next: (response: any) => {
        this.addMessageIfNew(response.data);
        this.newMessage = '';
        this.sending = false;
        this.thinking = true;
      },
      error: () => {
        this.errorMsg = 'No se pudo enviar el mensaje.';
        this.sending = false;
      }
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch {}
  }
}