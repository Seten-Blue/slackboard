import { Component, OnInit, OnDestroy, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { Subscription, interval } from 'rxjs';

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

  private shouldScroll = false;
  private subs: Subscription[] = [];
  private thinkingTimeout: any;
  private pollSub: Subscription | null = null;
  private lastMessageCount = 0;

  constructor(
    private chatService: ChatService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    this.chatService.getOrCreateAIChannel().subscribe({
      next: (response: any) => {
        this.channel = response.data;
        this.loadMessages();
        this.joinSocket();
        this.chatService.triggerChannelsRefresh();
      },
      error: () => {
        this.errorMsg = 'No se pudo conectar con Zork. Verifica que el backend este corriendo.';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.stopPolling();
    if (this.thinkingTimeout) clearTimeout(this.thinkingTimeout);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private joinSocket(): void {
    this.socketService.joinChannel(this.channel._id);

    const sub = this.socketService.onNewMessage().subscribe((data: any) => {
      if (data.channelId === this.channel._id) {
        this.addMessageIfNew(data.message);
        this.onResponseReceived();
      }
    });
    this.subs.push(sub);
  }

  private loadMessages(): void {
    this.loading = true;
    this.chatService.getMessagesByChannel(this.channel._id).subscribe({
      next: (response: any) => {
        this.messages = response.data || [];
        this.lastMessageCount = this.messages.length;
        this.loading = false;
        this.shouldScroll = true;
      },
      error: () => {
        this.errorMsg = 'No se pudieron cargar los mensajes.';
        this.loading = false;
      }
    });
  }

  private addMessageIfNew(msg: AIMessage): void {
    if (msg._id && this.messages.some(m => m._id === msg._id)) {
      return;
    }
    this.messages.push(msg);
    this.lastMessageCount = this.messages.length;
    this.shouldScroll = true;
  }

  private onResponseReceived(): void {
    this.thinking = false;
    this.stopPolling();
    if (this.thinkingTimeout) {
      clearTimeout(this.thinkingTimeout);
      this.thinkingTimeout = null;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.lastMessageCount = this.messages.length;
    this.pollSub = interval(3000).subscribe(() => {
      if (!this.channel) return;
      this.chatService.getMessagesByChannel(this.channel._id).subscribe({
        next: (response: any) => {
          const newMessages = response.data || [];
          if (newMessages.length > this.lastMessageCount) {
            for (const msg of newMessages) {
              this.addMessageIfNew(msg);
            }
            this.onResponseReceived();
          }
        }
      });
    });
  }

  private stopPolling(): void {
    if (this.pollSub) {
      this.pollSub.unsubscribe();
      this.pollSub = null;
    }
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

        this.startPolling();

        if (this.thinkingTimeout) clearTimeout(this.thinkingTimeout);
        this.thinkingTimeout = setTimeout(() => {
          this.thinking = false;
          this.stopPolling();
        }, 30000);
      },
      error: () => {
        this.errorMsg = 'No se pudo enviar el mensaje.';
        this.sending = false;
        this.thinking = false;
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
