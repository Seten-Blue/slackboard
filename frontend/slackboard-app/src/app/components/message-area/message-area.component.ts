import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, OnChanges, HostListener, AfterViewInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

@Component({
  selector: 'app-message-area',
  templateUrl: './message-area.component.html',
  styleUrls: ['./message-area.component.scss']
})
export class MessageAreaComponent implements OnInit, OnDestroy, AfterViewChecked, OnChanges, AfterViewInit {
  @Input() channel: any;
  @ViewChild('messageContainer') messageContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('particleCanvas') particleCanvasRef!: ElementRef<HTMLCanvasElement>;

  messages: any[] = [];
  newMessage = '';
  loading = false;
  userTyping: string | null = null;
  typingTimeout: any;
  currentUser: any;

  private subscriptions: Subscription[] = [];
  private shouldScrollToBottom = false;
  private animationFrameId: number | null = null;
  private particles: Particle[] = [];

  selectedFile: File | null = null;
  uploadingFile = false;

  showPicker = false;
  pickerTab: 'emojis' | 'stickers' = 'emojis';
  showAttachMenu = false;
  showPollModal = false;
  showThreadModal = false;

  // Thread panel state
  showThreadPanel = false;
  activeThreadId: string | null = null;

  readonly emojiCategories = [
    { label: 'Frecuentes', emojis: ['😀', '😂', '😍', '🥰', '😎', '🤔', '😅', '👍', '❤️', '🔥', '✨', '🎉', '👏', '💪', '🙌', '💯'] },
    { label: 'Caras', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑'] },
    { label: 'Manos', emojis: ['👍', '👎', '👏', '🙌', '🤝', '💪', '🫶', '✌️', '🤘', '🤙', '👋', '✋', '🖐️', '👌', '🤌', '🫳', '🫴', '🙏'] },
    { label: 'Objetos', emojis: ['📎', '📁', '📂', '📝', '✏️', '🖊️', '📌', '🔗', '📊', '📈', '🗓️', '⏰', '💻', '🖥️', '📱', '📧'] },
    { label: 'Actividad', emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '⭐', '🌟', '💫', '✅', '❌', '⚠️', '🚀', '💡', '🤖', '🎯'] }
  ];

  readonly stickerPacks = [
    {
      name: 'Reacciones',
      stickers: [
        { id: 'thumbsup', emoji: '👍', label: 'Aprobado' },
        { id: 'heart', emoji: '❤️', label: 'Corazon' },
        { id: 'fire', emoji: '🔥', label: 'Fuego' },
        { id: 'clap', emoji: '👏', label: 'Aplauso' },
        { id: 'laugh', emoji: '😂', label: 'Me muero' },
        { id: 'cry', emoji: '😭', label: 'Lloro' },
        { id: 'wow', emoji: '😮', label: 'Wow' },
        { id: 'think', emoji: '🤔', label: 'Pensando' },
        { id: 'cool', emoji: '😎', label: 'Cool' },
        { id: 'pray', emoji: '🙏', label: 'Gracias' },
        { id: 'strong', emoji: '💪', label: 'Fuerza' },
        { id: 'hundred', emoji: '💯', label: 'Perfecto' },
      ]
    },
    {
      name: 'Objetos',
      stickers: [
        { id: 'rocket', emoji: '🚀', label: 'Lanzamiento' },
        { id: 'star', emoji: '⭐', label: 'Estrella' },
        { id: 'trophy', emoji: '🏆', label: 'Victoria' },
        { id: 'lightning', emoji: '⚡', label: 'Energia' },
        { id: 'sparkles', emoji: '✨', label: 'Brillar' },
        { id: 'check', emoji: '✅', label: 'Hecho' },
        { id: 'x', emoji: '❌', label: 'No' },
        { id: 'warning', emoji: '⚠️', label: 'Atencion' },
        { id: 'bug', emoji: '🐛', label: 'Bug' },
        { id: 'wip', emoji: '🔧', label: 'En progreso' },
        { id: 'party', emoji: '🎉', label: 'Fiesta' },
        { id: 'eyes', emoji: '👀', label: 'Mirando' },
      ]
    },
    {
      name: 'Animales',
      stickers: [
        { id: 'cat', emoji: '🐱', label: 'Gato' },
        { id: 'dog', emoji: '🐶', label: 'Perro' },
        { id: 'bear', emoji: '🐻', label: 'Oso' },
        { id: 'fox', emoji: '🦊', label: 'Zorro' },
        { id: 'owl', emoji: '🦉', label: 'Buho' },
        { id: 'penguin', emoji: '🐧', label: 'Pingüino' },
        { id: 'unicorn', emoji: '🦄', label: 'Unicornio' },
        { id: 'dragon', emoji: '🐉', label: 'Dragon' },
        { id: 'robot', emoji: '🤖', label: 'Robot' },
        { id: 'alien', emoji: '👽', label: 'Alien' },
        { id: 'ghost', emoji: '👻', label: 'Fantasma' },
        { id: 'skull', emoji: '💀', label: 'Muerto' },
      ]
    },
    {
      name: 'Comida',
      stickers: [
        { id: 'coffee', emoji: '☕', label: 'Cafe' },
        { id: 'pizza', emoji: '🍕', label: 'Pizza' },
        { id: 'beer', emoji: '🍺', label: 'Cerveza' },
        { id: 'taco', emoji: '🌮', label: 'Taco' },
        { id: 'sushi', emoji: '🍣', label: 'Sushi' },
        { id: 'cake', emoji: '🎂', label: 'Torta' },
        { id: 'icecream', emoji: '🍦', label: 'Helado' },
        { id: 'cookie', emoji: '🍪', label: 'Galleta' },
        { id: 'apple', emoji: '🍎', label: 'Manzana' },
        { id: 'banana', emoji: '🍌', label: 'Banana' },
        { id: 'grape', emoji: '🍇', label: 'Uvas' },
        { id: 'watermelon', emoji: '🍉', label: 'Sandia' },
      ]
    }
  ];

  attachOptions = [
    { id: 'file', icon: '📎', label: 'Archivo', desc: 'Subir un archivo o imagen' },
    { id: 'poll', icon: '📊', label: 'Encuesta', desc: 'Crear una encuesta rapida' },
    { id: 'thread', icon: '💬', label: 'Hilo', desc: 'Crear un hilo de conversacion' },
  ];

  constructor(
    private chatService: ChatService,
    private socketService: SocketService
  ) {
    this.currentUser = this.chatService.getCurrentUser();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.picker-container') && !target.closest('.picker-toggle-btn')) {
      this.showPicker = false;
    }
    if (!target.closest('.attach-menu-container') && !target.closest('.attach-toggle-btn')) {
      this.showAttachMenu = false;
    }
  }

  ngOnInit() {
    this.setupSocketListeners();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.stopParticles();
  }

  ngAfterViewInit() {
    setTimeout(() => this.startParticles(), 0);
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnChanges() {
    if (this.channel) {
      this.showPicker = false;
      this.showAttachMenu = false;
      this.showPollModal = false;
      this.showThreadModal = false;
      this.loadMessages();
      this.socketService.joinChannel(this.channel._id);
      this.stopParticles();
      setTimeout(() => this.startParticles(), 0);
    }
  }

  // ========== Partículas de fondo ==========
  private getParticleColors(): { dot: string; line: string } {
    const platform = this.channel?.platform;
    if (platform === 'slack') {
      return { dot: 'rgba(100, 40, 130, 0.85)', line: 'rgba(100, 40, 130, 0.35)' };
    }
    // Discord y por defecto: estilo Trello
    return { dot: 'rgba(139, 124, 246, 0.85)', line: 'rgba(76, 63, 201, 0.32)' };
  }

  private resizeCanvas(): void {
    const canvas = this.particleCanvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }

  private startParticles(): void {
    const canvas = this.particleCanvasRef?.nativeElement;
    if (!canvas) return;

    this.stopParticles();
    this.resizeCanvas();

    const isSlack = this.channel?.platform === 'slack';
    const count = isSlack ? 50 : 40;
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * (isSlack ? 2.0 : 1.4) + (isSlack ? 0.8 : 0.5),
    }));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const linkDistance = 120;
    const colors = this.getParticleColors();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = colors.dot;
        ctx.fill();
      }

      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const a = this.particles[i];
          const b = this.particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDistance) {
            const opacity = 1 - dist / linkDistance;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = colors.line.replace(/[\d.]+\)$/, `${opacity * 0.45})`);
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();
  }

  private stopParticles(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
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
        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => { this.userTyping = null; }, 3000);
      }
    });

    const updatedSub = this.socketService.onMessageUpdated().subscribe((data: any) => {
      const index = this.messages.findIndex(m => m._id === data.messageId);
      if (index !== -1) {
        this.messages[index] = { ...this.messages[index], content: data.content, isEdited: true };
      }
    });

    const deletedSub = this.socketService.onMessageDeleted().subscribe((data: any) => {
      this.messages = this.messages.filter(m => m._id !== data.messageId);
    });

    const reactionSub = this.socketService.onMessageReaction().subscribe((data: any) => {
      const index = this.messages.findIndex(m => m._id === data.messageId);
      if (index !== -1) {
        this.messages[index] = { ...this.messages[index], reactions: data.reactions };
      }
    });

    const pollVotedSub = this.socketService.onPollVoted().subscribe((data: any) => {
      const index = this.messages.findIndex(m => m._id === data.messageId);
      if (index !== -1) {
        this.messages[index] = { ...this.messages[index], pollData: data.pollData };
      }
    });

    this.subscriptions.push(newMessageSub, typingSub, updatedSub, deletedSub, reactionSub, pollVotedSub);
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
      error: () => { this.loading = false; }
    });
  }

  sendMessage() {
    if ((!this.newMessage.trim() && !this.selectedFile) || !this.channel) return;

    const proceed = (attachments: string[]) => {
      const hasAttachments = attachments.length > 0;
      const messageData: any = {
        content: this.newMessage.trim() || (hasAttachments ? this.selectedFile?.name || 'Archivo adjunto' : ''),
        channel: this.channel._id,
        type: hasAttachments ? (this.isImageUrl(attachments[0]) ? 'image' : 'file') : 'text',
        attachments
      };

      this.chatService.sendMessage(messageData).subscribe({
        next: (response) => {
          this.messages.push(response.data);
          this.socketService.sendMessage({ channelId: this.channel._id, message: response.data });
          this.newMessage = '';
          this.selectedFile = null;
          this.shouldScrollToBottom = true;
        },
        error: (error) => {
          console.error('Error enviando mensaje:', error);
          alert('Error al enviar el mensaje');
        }
      });
    };

    if (this.selectedFile) {
      this.uploadingFile = true;
      this.chatService.uploadAttachment(this.selectedFile).subscribe({
        next: (response) => {
          this.uploadingFile = false;
          proceed([response.url]);
        },
        error: (error) => {
          this.uploadingFile = false;
          alert(error?.error?.message || 'No se pudo subir el archivo.');
        }
      });
    } else {
      proceed([]);
    }
  }

  sendSticker(sticker: any) {
    if (!this.channel) return;

    const messageData = {
      content: sticker.emoji,
      channel: this.channel._id,
      type: 'sticker' as const,
      attachments: []
    };

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        this.messages.push(response.data);
        this.socketService.sendMessage({ channelId: this.channel._id, message: response.data });
        this.showPicker = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('Error enviando sticker:', error);
      }
    });
  }

  handleAttachOption(optionId: string) {
    this.showAttachMenu = false;
    switch (optionId) {
      case 'file':
        this.openFilePicker();
        break;
      case 'poll':
        this.showPollModal = true;
        break;
      case 'thread':
        this.showThreadModal = true;
        break;
    }
  }

  onPollSubmit(pollData: any) {
    this.showPollModal = false;
    if (!this.channel) return;

    const now = new Date();
    let expiresAt: Date | null = null;
    if (pollData.duration > 0) {
      expiresAt = new Date(now.getTime() + pollData.duration * 3600000);
    }

    const messageData = {
      content: `📊 ${pollData.question}`,
      channel: this.channel._id,
      type: 'poll',
      attachments: [],
      pollData: {
        question: pollData.question,
        options: pollData.options.map((opt: any) => ({
          emoji: opt.emoji || '',
          text: opt.text,
          voters: []
        })),
        allowMultiple: pollData.allowMultiple,
        isAnonymous: pollData.isAnonymous,
        duration: pollData.duration,
        createdBy: this.currentUser._id,
        expiresAt
      }
    };

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        this.messages.push(response.data);
        this.socketService.sendMessage({ channelId: this.channel._id, message: response.data });
        this.shouldScrollToBottom = true;
      },
      error: () => alert('Error al crear la encuesta')
    });
  }

  onThreadSubmit(threadData: any) {
    this.showThreadModal = false;
    if (!this.channel) return;

    const messageData = {
      content: `💬 ${threadData.title}`,
      channel: this.channel._id,
      type: 'thread',
      attachments: [],
      threadData: {
        title: threadData.title,
        initialMessage: threadData.initialMessage
      }
    };

    this.chatService.sendMessage(messageData).subscribe({
      next: (response) => {
        this.messages.push(response.data);
        this.socketService.sendMessage({ channelId: this.channel._id, message: response.data });
        this.shouldScrollToBottom = true;
      },
      error: () => alert('Error al crear el hilo')
    });
  }

  openThreadPanel(messageId: string) {
    this.activeThreadId = messageId;
    this.showThreadPanel = true;
  }

  closeThreadPanel() {
    this.showThreadPanel = false;
    this.activeThreadId = null;
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onTyping() {
    if (!this.channel) return;
    this.socketService.sendTyping({ channelId: this.channel._id, username: this.currentUser.username });
  }

  openFilePicker() {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
      this.fileInput.nativeElement.click();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  removeSelectedFile() {
    this.selectedFile = null;
  }

  togglePicker(event: Event) {
    event.stopPropagation();
    this.showPicker = !this.showPicker;
    this.showAttachMenu = false;
  }

  setPickerTab(tab: 'emojis' | 'stickers', event: Event) {
    event.stopPropagation();
    this.pickerTab = tab;
  }

  toggleAttachMenu(event: Event) {
    event.stopPropagation();
    this.showAttachMenu = !this.showAttachMenu;
    this.showPicker = false;
  }

  insertEmoji(emoji: string) {
    this.newMessage += emoji;
    this.showPicker = false;
    if (this.messageInput) this.messageInput.nativeElement.focus();
  }

  onPickerClick(event: Event) {
    event.stopPropagation();
  }

  downloadFile(url: string, event: Event) {
    event.preventDefault();
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  isImageUrl(url: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(url || '');
  }

  getFileName(url: string): string {
    try {
      const parts = url.split('/');
      const last = parts[parts.length - 1].split('?')[0];
      return decodeURIComponent(last) || 'archivo';
    } catch { return 'archivo'; }
  }

  getFileIcon(url: string): string {
    if (/\.pdf$/i.test(url)) return '📄';
    if (/\.(doc|docx)$/i.test(url)) return '📝';
    if (/\.(xls|xlsx|csv)$/i.test(url)) return '📊';
    if (/\.(zip|rar|tar|gz)$/i.test(url)) return '📦';
    if (/\.(mp4|webm|avi|mov)$/i.test(url)) return '🎬';
    if (/\.(mp3|wav|ogg|m4a)$/i.test(url)) return '🎵';
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(url)) return '🖼️';
    return '📎';
  }

  isStickerMessage(message: any): boolean {
    return message.type === 'sticker';
  }

  isPollMessage(message: any): boolean {
    return message.type === 'poll' && message.pollData;
  }

  isThreadMessage(message: any): boolean {
    return message.type === 'thread' && message.threadData;
  }

  addReaction(messageId: string, emoji: string) {
    this.chatService.addReaction(messageId, emoji).subscribe({
      next: (response) => {
        const index = this.messages.findIndex(m => m._id === messageId);
        if (index !== -1) this.messages[index] = response.data;
      },
      error: (error) => console.error('Error agregando reaccion:', error)
    });
  }

  shouldGroupWithPrevious(index: number): boolean {
    if (index === 0) return false;
    const current = this.messages[index];
    const previous = this.messages[index - 1];
    if (!current || !previous) return false;
    if (current.sender?._id !== previous.sender?._id) return false;
    if (current.type === 'sticker' || previous.type === 'sticker') return false;
    if (current.type === 'poll' || current.type === 'thread') return false;
    const currentTime = new Date(current.createdAt).getTime();
    const previousTime = new Date(previous.createdAt).getTime();
    return (currentTime - previousTime) < 5 * 60 * 1000;
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
      if (this.messageContainer) {
        const element = this.messageContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch {}
  }
}
