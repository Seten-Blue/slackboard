import { Component, EventEmitter, Input, Output, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-thread-panel',
  templateUrl: './thread-panel.component.html',
  styleUrls: ['./thread-panel.component.scss']
})
export class ThreadPanelComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() isOpen = false;
  @Input() messageId: string | null = null;
  @Output() close = new EventEmitter<void>();

  @ViewChild('repliesContainer') repliesContainer!: ElementRef;
  @ViewChild('replyInput') replyInput!: ElementRef;

  parentMessage: any = null;
  replies: any[] = [];
  newReply = '';
  loading = false;
  sending = false;
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
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnChanges() {
    if (this.isOpen && this.messageId) {
      this.loadThread();
    }
  }

  setupSocketListeners() {
    const replySub = this.socketService.onThreadReply().subscribe((data: any) => {
      if (data.parentMessageId === this.messageId) {
        const exists = this.replies.some((r: any) => r._id === data.reply._id);
        if (!exists) {
          this.replies.push(data.reply);
          this.shouldScrollToBottom = true;
        }
      }
    });

    this.subscriptions.push(replySub);
  }

  loadThread() {
    if (!this.messageId) return;
    this.loading = true;

    this.chatService.getThreadReplies(this.messageId).subscribe({
      next: (response) => {
        this.replies = response.data || [];
        this.loading = false;
        this.shouldScrollToBottom = true;
      },
      error: () => { this.loading = false; }
    });
  }

  sendReply() {
    if (!this.newReply.trim() || !this.messageId || this.sending) return;

    this.sending = true;
    this.chatService.replyToThread(this.messageId, this.newReply.trim()).subscribe({
      next: (response) => {
        this.replies.push(response.data);
        this.newReply = '';
        this.sending = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('Error enviando respuesta:', error);
        this.sending = false;
      }
    });
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendReply();
    }
  }

  onClose() {
    this.replies = [];
    this.parentMessage = null;
    this.newReply = '';
    this.close.emit();
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
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom(): void {
    try {
      if (this.repliesContainer) {
        const element = this.repliesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch {}
  }
}
