import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { TrelloService } from '../../services/trello.service';
import { AuthService } from '../../services/auth.service';
import { TrelloNotificationsService } from '../../services/trello-notifications.service';

interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  url: string;
  closed: boolean;
}

interface TrelloList {
  id: string;
  name: string;
  pos: number;
}

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  idList: string;
  pos: number;
  due: string | null;
  dueComplete: boolean;
  labels: any[];
  closed: boolean;
  badges?: any;
  cover?: any;
  members?: any[];
  idMembers?: string[];
  shortUrl?: string;
  checklists?: any[];
}

type BoardBackground = 'particles' | 'aurora' | 'nebula' | 'midnight';

// Cache local del tablero: evita recargar todo desde Trello al volver a
// entrar y mantiene las imagenes/portadas disponibles al instante.
const TRELLO_CACHE_TTL_MS = 10 * 60 * 1000;
const TRELLO_CACHE_PREFIX = 'trello-cache';
const TRELLO_CACHE_BOARDS_KEY = `${TRELLO_CACHE_PREFIX}:boards`;
const TRELLO_CACHE_SELECTED_KEY = `${TRELLO_CACHE_PREFIX}:selected-board`;

interface BoardContentsCache {
  ts: number;
  lists: TrelloList[];
  cards: TrelloCard[];
  members: any[];
  labels: any[];
}

interface BoardsCache {
  ts: number;
  boards: TrelloBoard[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

const TRELLO_LABEL_COLORS: Record<string, string> = {
  green: '#4BCE97',
  yellow: '#F5CD47',
  orange: '#FEA362',
  red: '#F87168',
  purple: '#9F8FEF',
  blue: '#579DFF',
  sky: '#6CC3E0',
  lime: '#94C748',
  pink: '#E774BB',
  black: '#8590A2',
  null: '#DFE1E6',
};

const BACKGROUND_OPTIONS: { id: BoardBackground; label: string }[] = [
  { id: 'particles', label: 'Partículas' },
  { id: 'aurora', label: 'Aurora' },
  { id: 'nebula', label: 'Nebulosa' },
  { id: 'midnight', label: 'Medianoche' },
];

@Component({
  selector: 'app-trello',
  templateUrl: './trello.component.html',
  styleUrls: ['./trello.component.scss']
})
export class TrelloComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('particleCanvas') particleCanvasRef?: ElementRef<HTMLCanvasElement>;

  boards: TrelloBoard[] = [];
  selectedBoard: TrelloBoard | null = null;
  lists: TrelloList[] = [];
  cards: TrelloCard[] = [];
  boardLabels: any[] = [];
  boardMembers: any[] = [];

  loadingBoards = true;
  loadingBoard = false;
  showBoardPicker = false;

  trelloLinked = false;
  showSetup = false;
  setupLoading = false;
  setupError: string | null = null;

  addingCardToList: string | null = null;
  newCardName = '';

  selectedCard: TrelloCard | null = null;
  editedCardName = '';
  editedCardDesc = '';
  editedCardDue = '';
  editedCardDueComplete = false;
  savingCard = false;
  editingDesc = false;

  selectedCardAttachments: any[] = [];
  loadingAttachments = false;
  newAttachmentUrl = '';
  uploadingFile = false;

  cardActions: any[] = [];
  recentNotifications: any[] = [];
  loadingActions = false;
  newComment = '';
  sendingComment = false;

  lightboxUrl: string | null = null;
  lightboxZoom = 1;

  failedAttachmentImages: Set<string> = new Set();
  failedCommentImages: Set<string> = new Set();

  showAddList = false;
  newListName = '';
  listMenuOpenFor: string | null = null;

  private draggedCard: TrelloCard | null = null;

  // ============ FONDO DEL TABLERO ============
  backgroundOptions = BACKGROUND_OPTIONS;
  showBackgroundPicker = false;
  currentBackground: BoardBackground = 'particles';

  private particles: Particle[] = [];
  private animationFrameId: number | null = null;
  private resizeListener = () => this.resizeCanvas();

  constructor(private trelloService: TrelloService, private authService: AuthService, public trelloNotif: TrelloNotificationsService) {}

  ngOnInit() {
    this.checkTrelloStatus();

    this.trelloNotif.list$.subscribe((list) => {
      this.recentNotifications = list;
    });

    // Al entrar al modulo, las notificaciones ya se "vieron": el badge del
    // menu se limpia, pero los marcadores sobre las tarjetas permanecen.
    this.trelloNotif.count$.subscribe((count) => {
      if (count > 0) this.trelloNotif.markRead();
    });
  }

  ngAfterViewInit(): void {
    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    this.stopParticles();
  }

  checkTrelloStatus() {
    this.authService.getTrelloStatus().subscribe({
      next: (res) => {
        this.trelloLinked = res.data?.linked || false;
        if (this.trelloLinked) {
          this.loadBoards();
        } else {
          this.loadingBoards = false;
          this.showSetup = true;
        }
      },
      error: () => {
        this.loadingBoards = false;
        this.showSetup = true;
      }
    });
  }

  linkTrello() {
    this.setupLoading = true;
    this.setupError = null;
    this.authService.startTrelloLink().subscribe({
      next: (res) => {
        if (res.url) {
          const popup = window.open(res.url, 'trello-auth', 'width=600,height=700,left=200,top=100');

          // Listen for postMessage from Trello
          const messageHandler = (event: MessageEvent) => {
            // Trello sends the token as a string in postMessage
            const token = event.data;
            if (typeof token === 'string' && token.length > 10) {
              window.removeEventListener('message', messageHandler);
              popup?.close();
              this.finishTrelloLink(token);
            }
          };
          window.addEventListener('message', messageHandler);

          // Fallback: check if popup closed without sending message
          const checkInterval = setInterval(() => {
            if (popup?.closed) {
              clearInterval(checkInterval);
              window.removeEventListener('message', messageHandler);
              this.setupLoading = false;
              // If we got here without a token, just re-check status
              this.checkTrelloStatus();
            }
          }, 1000);
        } else {
          this.setupLoading = false;
          this.setupError = res.message || 'No se pudo iniciar la vinculacion de Trello';
        }
      },
      error: (err) => {
        this.setupLoading = false;
        this.setupError = err?.error?.message || 'Error al iniciar la vinculacion de Trello';
      }
    });
  }

  private finishTrelloLink(token: string) {
    this.authService.finishTrelloLink(token).subscribe({
      next: (res) => {
        this.trelloLinked = true;
        this.showSetup = false;
        this.setupLoading = false;
        this.loadBoards();
      },
      error: (err) => {
        this.setupLoading = false;
        this.setupError = err?.error?.message || 'Error al guardar el token de Trello';
      }
    });
  }

  unlinkTrello() {
    if (!confirm('Desvincular tu cuenta de Trello?')) return;
    this.authService.unlinkTrello().subscribe({
      next: () => {
        this.trelloLinked = false;
        this.boards = [];
        this.selectedBoard = null;
        this.showSetup = true;
        this.clearTrelloCache();
      }
    });
  }

  private clearTrelloCache() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(TRELLO_CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignorar
    }
  }

  loadBoards() {
    this.loadingBoards = true;

    const cached = this.readCache<BoardsCache>(TRELLO_CACHE_BOARDS_KEY);
    const previouslySelected = localStorage.getItem(TRELLO_CACHE_SELECTED_KEY);

    if (cached && cached.boards.length > 0) {
      this.renderBoards(cached.boards, previouslySelected);
    }

    this.trelloService.getBoards().subscribe({
      next: (response) => {
        const boards = (response.data || []).filter((b: TrelloBoard) => !b.closed);
        this.renderBoards(boards, previouslySelected);
        this.writeCache(TRELLO_CACHE_BOARDS_KEY, { ts: Date.now(), boards });
      },
      error: (error) => {
        console.error('Error cargando tableros de Trello:', error);
        this.loadingBoards = false;
        if (error?.status === 400) {
          this.showSetup = true;
        }
      }
    });
  }

  private renderBoards(boards: TrelloBoard[], previouslySelected: string | null) {
    this.boards = boards;
    this.loadingBoards = false;
    if (!boards.length) return;
    const toSelect = previouslySelected
      ? boards.find((b) => b.id === previouslySelected)
      : undefined;
    this.selectBoard(toSelect || boards[0]);
  }

  selectBoard(board: TrelloBoard) {
    if (this.selectedBoard?.id === board.id) return;
    this.selectedBoard = board;
    this.showBoardPicker = false;
    localStorage.setItem(TRELLO_CACHE_SELECTED_KEY, board.id);
    this.loadBoardContents();
    this.loadBoardBackground();
  }

  loadBoardContents() {
    if (!this.selectedBoard) return;

    const cacheKey = `${TRELLO_CACHE_PREFIX}:board-${this.selectedBoard.id}`;
    const cached = this.readCache<BoardContentsCache>(cacheKey);

    if (cached) {
      this.applyBoardContents(cached);
      this.loadingBoard = false;
      this.refreshBoardContents(cacheKey);
    } else {
      this.loadingBoard = true;
      this.lists = [];
      this.cards = [];
      this.boardLabels = [];
      this.boardMembers = [];
      this.refreshBoardContents(cacheKey);
    }
  }

  private refreshBoardContents(cacheKey: string) {
    if (!this.selectedBoard) return;

    this.trelloService.getBoardContents(this.selectedBoard.id).subscribe({
      next: (response) => {
        const prev = this.readCache<BoardContentsCache>(cacheKey);
        const contents: BoardContentsCache = {
          ts: Date.now(),
          lists: (response.data.lists || []).sort((a: TrelloList, b: TrelloList) => a.pos - b.pos),
          cards: (response.data.cards || []).filter((c: TrelloCard) => !c.closed),
          members: response.data.members || [],
          labels: (this.boardLabels && this.boardLabels.length > 0) ? this.boardLabels : (prev?.labels || []),
        };
        this.applyBoardContents(contents);
        this.loadingBoard = false;
        this.writeCache(cacheKey, contents);
      },
      error: (error) => {
        console.error('Error cargando el tablero:', error);
        this.loadingBoard = false;
      }
    });

    this.trelloService.getBoardLabels(this.selectedBoard.id).subscribe({
      next: (response) => {
        this.boardLabels = response.data || [];
        const stored = this.readCache<BoardContentsCache>(cacheKey);
        if (stored) {
          stored.labels = this.boardLabels;
          stored.ts = Date.now();
          this.writeCache(cacheKey, stored);
        }
      },
      error: (error) => {
        console.error('Error cargando etiquetas:', error);
      }
    });
  }

  private applyBoardContents(contents: BoardContentsCache) {
    this.lists = contents.lists || [];
    this.cards = contents.cards || [];
    this.boardMembers = contents.members || [];
    this.boardLabels = contents.labels || [];
  }

  private readCache<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as any;
      if (!parsed || typeof parsed.ts !== 'number') return null;
      if (Date.now() - parsed.ts > TRELLO_CACHE_TTL_MS) return null;
      return parsed as T;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, data: any) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // cache llena o no disponible: ignorar
    }
  }

  cardsInList(listId: string): TrelloCard[] {
    return this.cards
      .filter(c => c.idList === listId)
      .sort((a, b) => a.pos - b.pos);
  }

  labelColor(colorName: string | null): string {
    return TRELLO_LABEL_COLORS[colorName || 'null'] || TRELLO_LABEL_COLORS['null'];
  }

  // ---------- Due date helpers ----------

  dueLabel(due: string | null, complete: boolean): string {
    if (!due || complete) return '';
    const now = new Date();
    const dueDate = new Date(due);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `Vencida hace ${Math.abs(diffDays)}d`;
    if (diffDays === 0) return 'Vence hoy';
    if (diffDays === 1) return 'Vence manana';
    return `Vence en ${diffDays}d`;
  }

  dueUrgency(due: string | null, complete: boolean): 'overdue' | 'soon' | 'ok' | '' {
    if (!due || complete) return '';
    const now = new Date();
    const dueDate = new Date(due);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 2) return 'soon';
    return 'ok';
  }

  // ---------- Checklist helpers ----------

  checklistStats(card: TrelloCard): { total: number; checked: number } | null {
    const checklists = card.checklists;
    if (!checklists || checklists.length === 0) return null;
    let total = 0;
    let checked = 0;
    for (const cl of checklists) {
      for (const item of (cl.checkItems || [])) {
        total++;
        if (item.state === 'complete') checked++;
      }
    }
    return total > 0 ? { total, checked } : null;
  }

  // ---------- Member helpers ----------

  cardMembers(card: TrelloCard): any[] {
    if (!card.members || card.members.length === 0) return [];
    return card.members;
  }

  memberAvatarUrl(member: any): string {
    const name = member.fullName || member.username || '?';
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&fontWeight=600&backgroundColor=6366f1`;
  }

  memberInitials(member: any): string {
    const name = member.fullName || member.username || '?';
    return name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
  }

  // ---------- Cover helpers ----------

  coverImageUrl(card: TrelloCard): string | null {
    if (!card.cover) return null;
    if (card.cover.url) return card.cover.url;
    if (card.cover.scaled) {
      const scaled = card.cover.scaled.find((s: any) => s.width >= 200) || card.cover.scaled[0];
      return scaled?.url || null;
    }
    return null;
  }

  coverColor(card: TrelloCard): string | null {
    if (!card.cover) return null;
    return card.cover.color || null;
  }

  // Portada en maxima calidad (para el panel y el lightbox)
  coverFullUrl(card: TrelloCard): string | null {
    if (!card?.cover) return null;
    if (card.cover.url) return card.cover.url;
    const scaled = (card.cover.scaled || []).filter((s: any) => s?.url);
    if (!scaled.length) return null;
    const largest = scaled.reduce((a: any, b: any) =>
      ((b.width || 0) * (b.height || 0)) > ((a.width || 0) * (a.height || 0)) ? b : a
    );
    return largest.url || null;
  }

  // Imagen grande del lightbox: portada a maxima resolucion, si no la original
  coverLightboxUrl(card: TrelloCard): string | null {
    return this.coverFullUrl(card);
  }

  // ---------- Description preview ----------

  hasDescription(card: TrelloCard): boolean {
    return !!(card.desc && card.desc.trim().length > 0);
  }

  // ---------- List name ----------

  getListName(listId: string): string {
    const list = this.lists.find(l => l.id === listId);
    return list?.name || '';
  }

  // ---------- Checklist toggle ----------

  toggleCheckItem(card: TrelloCard, checklistId: string, itemId: string, currentState: string) {
    const newState = currentState === 'complete' ? 'incomplete' : 'complete';
    this.trelloService.updateCheckItem(card.id, checklistId, itemId, newState).subscribe({
      next: () => {
        const cl = card.checklists?.find((c: any) => c.id === checklistId);
        const item = cl?.checkItems?.find((i: any) => i.id === itemId);
        if (item) item.state = newState;
      },
      error: (error) => {
        console.error('Error actualizando checklist:', error);
      }
    });
  }

  checkedCount(cl: any): number {
    return (cl.checkItems || []).filter((i: any) => i.state === 'complete').length;
  }

  // ---------- Tarjetas ----------

  startAddingCard(listId: string) {
    this.addingCardToList = listId;
    this.newCardName = '';
  }

  cancelAddingCard() {
    this.addingCardToList = null;
    this.newCardName = '';
  }

  confirmAddCard() {
    const listId = this.addingCardToList;
    const name = this.newCardName.trim();
    if (!listId || !name) return;

    this.trelloService.createCard(listId, name).subscribe({
      next: (response) => {
        this.cards.push(response.data);
        this.newCardName = '';
      },
      error: (error) => {
        console.error('Error creando tarjeta:', error);
        alert(error?.error?.message || 'No fue posible crear la tarjeta.');
      }
    });
  }

  openCard(card: TrelloCard) {
    this.selectedCard = card;
    this.editedCardName = card.name;
    this.editedCardDesc = card.desc || '';
    this.editedCardDue = card.due ? card.due.substring(0, 10) : '';
    this.editedCardDueComplete = card.dueComplete;
    this.loadCardAttachments(card.id);
    this.loadCardActions(card.id);
    this.trelloNotif.acknowledge(card.id);
  }

  closeCardPanel() {
    this.selectedCard = null;
    this.selectedCardAttachments = [];
    this.newAttachmentUrl = '';
    this.cardActions = [];
    this.newComment = '';
  }

  saveCard() {
    if (!this.selectedCard || this.savingCard) return;
    const name = this.editedCardName.trim();
    if (!name) return;

    this.savingCard = true;
    this.trelloService.updateCard(this.selectedCard.id, {
      name,
      desc: this.editedCardDesc,
      due: this.editedCardDue ? this.editedCardDue : null,
      dueComplete: this.editedCardDueComplete
    }).subscribe({
      next: (response) => {
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) {
          this.cards[index] = response.data;
        }
        this.selectedCard = response.data;
        this.savingCard = false;
      },
      error: (error) => {
        console.error('Error actualizando tarjeta:', error);
        alert(error?.error?.message || 'No fue posible guardar los cambios.');
        this.savingCard = false;
      }
    });
  }

  // ---------- Auto-save helpers ----------

  autoSaveName() {
    if (!this.selectedCard) return;
    const name = this.editedCardName.trim();
    if (!name || name === this.selectedCard.name) return;
    this.trelloService.updateCard(this.selectedCard.id, { name }).subscribe({
      next: (response) => {
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) this.cards[index].name = name;
        if (this.selectedCard) this.selectedCard.name = name;
      }
    });
  }

  autoSaveDesc() {
    if (!this.selectedCard) return;
    const desc = this.editedCardDesc;
    if (desc === (this.selectedCard.desc || '')) return;
    this.trelloService.updateCard(this.selectedCard.id, { desc }).subscribe({
      next: (response) => {
        if (this.selectedCard) this.selectedCard.desc = desc;
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) this.cards[index].desc = desc;
      }
    });
  }

  autoSaveDue() {
    if (!this.selectedCard) return;
    const due = this.editedCardDue ? this.editedCardDue : null;
    if (due === (this.selectedCard.due ? this.selectedCard.due.substring(0, 10) : null)) return;
    this.trelloService.updateCard(this.selectedCard.id, { due }).subscribe({
      next: (response) => {
        if (this.selectedCard) this.selectedCard.due = response.data.due;
      }
    });
  }

  autoSaveDueComplete() {
    if (!this.selectedCard) return;
    const dueComplete = this.editedCardDueComplete;
    if (dueComplete === this.selectedCard.dueComplete) return;
    this.trelloService.updateCard(this.selectedCard.id, { dueComplete }).subscribe({
      next: (response) => {
        if (this.selectedCard) this.selectedCard.dueComplete = dueComplete;
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) this.cards[index].dueComplete = dueComplete;
      }
    });
  }

  // ---------- Lightbox ----------

  openLightbox(url: string | null, event: Event) {
    event.stopPropagation();
    if (url) {
      this.lightboxUrl = url;
      this.lightboxZoom = 1;
    }
  }

  closeLightbox() {
    this.lightboxUrl = null;
    this.lightboxZoom = 1;
  }

  zoomIn() {
    this.lightboxZoom = Math.min(4, this.roundZoom(this.lightboxZoom + 0.5));
  }

  zoomOut() {
    this.lightboxZoom = Math.max(0.5, this.roundZoom(this.lightboxZoom - 0.5));
  }

  resetZoom() {
    this.lightboxZoom = 1;
  }

  lightboxOnWheel(event: WheelEvent) {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY < 0 ? 0.25 : -0.25;
    this.lightboxZoom = Math.max(0.5, Math.min(4, this.roundZoom(this.lightboxZoom + delta)));
  }

  private roundZoom(value: number): number {
    return Math.round(value * 100) / 100;
  }

  // ---------- Fallbacks de imagenes rotas ----------

  attachmentImageFailed(attachment: any): boolean {
    return !!attachment && this.failedAttachmentImages.has(attachment.id);
  }

  markAttachmentImageFailed(attachment: any) {
    if (attachment?.id) this.failedAttachmentImages.add(attachment.id);
  }

  commentImageKey(action: any): string {
    return action?.id || JSON.stringify(action?.data?.text || '');
  }

  commentImageFailed(action: any): boolean {
    return this.failedCommentImages.has(this.commentImageKey(action));
  }

  markCommentImageFailed(action: any) {
    if (this.commentImageKey(action)) this.failedCommentImages.add(this.commentImageKey(action));
  }

  // ---------- Comment image parsing ----------

  private readonly MARKDOWN_IMG_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^)\s]*)?)\)/i;
  private readonly RAW_IMAGE_URL_RE = /https?:\/\/[^\s)'">]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)'">]*)?/i;

  commentHasImages(action: any): boolean {
    return !!this.extractCommentImageUrl(action);
  }

  // URL de la imagen del comentario: se usa el enlace directo de trello.com
  // (funciona con la sesion de Trello del navegador y se cachea); si no
  // puede cargar, el onerror activa el fallback "Ver en Trello".
  commentImageUrl(action: any): string {
    const url = this.extractCommentImageUrl(action);
    if (!url) return '';
    return url.replace(/[)]$/, '').trim();
  }

  // URL original (para abrir en Trello cuando la imagen no se puede mostrar)
  commentOriginalUrl(action: any): string {
    return this.extractCommentImageUrl(action) || '';
  }

  // Texto del comentario sin el codigo markdown/imagenes de la URL
  commentText(action: any): string {
    const text = action?.data?.text || '';
    return text
      .replace(this.MARKDOWN_IMG_RE, '')
      .replace(this.RAW_IMAGE_URL_RE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private extractCommentImageUrl(action: any): string | null {
    const text = action?.data?.text || '';
    const markdown = text.match(this.MARKDOWN_IMG_RE);
    const found = markdown ? markdown[1] : text.match(this.RAW_IMAGE_URL_RE);
    if (!found) return null;
    return found.replace(/[)]$/, '').trim();
  }

  archiveCard(card: TrelloCard) {
    if (!confirm(`¿Archivar la tarjeta "${card.name}"?`)) return;

    this.trelloService.archiveCard(card.id).subscribe({
      next: () => {
        this.cards = this.cards.filter(c => c.id !== card.id);
        if (this.selectedCard?.id === card.id) {
          this.closeCardPanel();
        }
      },
      error: (error) => {
        console.error('Error archivando tarjeta:', error);
        alert(error?.error?.message || 'No fue posible archivar la tarjeta.');
      }
    });
  }

  // ---------- Etiquetas ----------

  isLabelOnCard(labelId: string): boolean {
    return !!this.selectedCard?.labels?.some((l: any) => l.id === labelId);
  }

  toggleLabel(label: any) {
    if (!this.selectedCard) return;
    const isOn = this.isLabelOnCard(label.id);
    const action: 'add' | 'remove' = isOn ? 'remove' : 'add';

    this.trelloService.toggleCardLabel(this.selectedCard.id, label.id, action).subscribe({
      next: () => {
        if (!this.selectedCard) return;
        if (isOn) {
          this.selectedCard.labels = this.selectedCard.labels.filter((l: any) => l.id !== label.id);
        } else {
          this.selectedCard.labels = [...(this.selectedCard.labels || []), label];
        }
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) this.cards[index] = this.selectedCard;
      },
      error: (error) => {
        console.error('Error actualizando etiqueta:', error);
        alert(error?.error?.message || 'No fue posible actualizar la etiqueta.');
      }
    });
  }

  // ---------- Adjuntos ----------

  loadCardAttachments(cardId: string) {
    this.loadingAttachments = true;
    this.selectedCardAttachments = [];
    this.trelloService.getAttachments(cardId).subscribe({
      next: (response) => {
        this.selectedCardAttachments = response.data || [];
        this.loadingAttachments = false;
      },
      error: () => {
        this.loadingAttachments = false;
      }
    });
  }

  addAttachmentUrl() {
    if (!this.selectedCard || !this.newAttachmentUrl.trim()) return;
    this.trelloService.addAttachmentUrl(this.selectedCard.id, this.newAttachmentUrl.trim()).subscribe({
      next: (response) => {
        this.selectedCardAttachments.push(response.data);
        this.newAttachmentUrl = '';
      },
      error: (error) => {
        console.error('Error adjuntando enlace:', error);
        alert(error?.error?.message || 'No fue posible adjuntar el enlace.');
      }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.selectedCard) return;

    this.uploadingFile = true;
    this.trelloService.uploadAttachment(this.selectedCard.id, file).subscribe({
      next: (response) => {
        this.selectedCardAttachments.push(response.data);
        this.uploadingFile = false;
        input.value = '';
      },
      error: (error) => {
        console.error('Error subiendo archivo:', error);
        alert(error?.error?.message || 'No fue posible subir el archivo.');
        this.uploadingFile = false;
        input.value = '';
      }
    });
  }

  // ← FIX: ahora también revisa mimeType (más confiable que solo la extensión)
  isImageAttachment(attachment: any): boolean {
    if (attachment.mimeType?.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(attachment.url || attachment.name || '');
  }

  // ---------- Actividad / Comentarios ----------

  loadCardActions(cardId: string) {
    this.loadingActions = true;
    this.trelloService.getCardActions(cardId).subscribe({
      next: (response) => {
        this.cardActions = (response.data || []).sort((a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        this.loadingActions = false;
      },
      error: () => {
        this.loadingActions = false;
      }
    });
  }

  sendComment() {
    if (!this.selectedCard || !this.newComment.trim() || this.sendingComment) return;
    this.sendingComment = true;
    this.trelloService.addComment(this.selectedCard.id, this.newComment.trim()).subscribe({
      next: (response) => {
        this.cardActions.unshift(response.data);
        this.newComment = '';
        this.sendingComment = false;
      },
      error: (error) => {
        console.error('Error enviando comentario:', error);
        this.sendingComment = false;
      }
    });
  }

  actionAuthor(action: any): string {
    return action?.memberCreator?.fullName || action?.memberCreator?.username || 'Alguien';
  }

  actionAuthorAvatar(action: any): string {
    const name = action?.memberCreator?.fullName || action?.memberCreator?.username || '?';
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&fontWeight=600&backgroundColor=6366f1`;
  }

  actionAuthorInitials(action: any): string {
    const name = action?.memberCreator?.fullName || action?.memberCreator?.username || '?';
    return name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
  }

  actionDescription(action: any): string {
    const type = action?.type;
    if (type === 'commentCard') return null as any;
    if (type === 'updateCard' && action?.data?.old?.desc !== undefined) return 'cambio la descripcion';
    if (type === 'addAttachmentToCard') return `anadio el adjunto "${action?.data?.attachment?.name || ''}"`;
    if (type === 'addMemberToCard') return `anadio a ${action?.data?.member?.fullName || ''}`;
    if (type === 'createCard') return 'anadio esta tarjeta';
    if (type === 'moveCardFromBoard' || type === 'moveCardToBoard') return 'movio esta tarjeta';
    return null as any;
  }

  timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora mismo';
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `hace ${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `hace ${diffDays}d`;
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ---------- Marcar como Hecho ----------

  toggleDone() {
    if (!this.selectedCard) return;
    const newComplete = !this.selectedCard.dueComplete;
    this.trelloService.updateCard(this.selectedCard.id, {
      dueComplete: newComplete
    }).subscribe({
      next: (response) => {
        this.selectedCard!.dueComplete = newComplete;
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) this.cards[index].dueComplete = newComplete;
      },
      error: (error) => {
        console.error('Error marcando hecha:', error);
      }
    });
  }

  // ---------- Quitar portada ----------

  removeCover() {
    if (!this.selectedCard) return;
    this.trelloService.updateCard(this.selectedCard.id, { cover: null }).subscribe({
      next: () => {
        if (this.selectedCard) this.selectedCard.cover = null;
        const index = this.cards.findIndex(c => c.id === this.selectedCard!.id);
        if (index !== -1) this.cards[index].cover = null;
      },
      error: (error) => {
        console.error('Error quitando portada:', error);
      }
    });
  }

  // URL que usan los <img>: las imagenes alojadas por Trello se cargan
  // directo desde trello.com (su navegador ya tiene la sesion de Trello, y
  // el navegador las cachea). Si no carga, el onerror activa el fallback.
  // Enlaces externos se muestran tal cual.
  attachmentSrc(attachment: any): string | null {
    if (!this.selectedCard) return null;
    if (attachment?.url && !this.isTrelloHosted(attachment.url)) return attachment.url;
    if ((attachment?.previews || []).length) {
      const largest = [...attachment.previews].sort((a: any, b: any) =>
        ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
      )[0];
      if (largest?.url) return largest.url;
    }
    return attachment?.url || null;
  }

  private isTrelloHosted(url: string): boolean {
    return !!url && /trello\.com/i.test(url);
  }

  // ---------- Listas ----------

  toggleListMenu(listId: string) {
    this.listMenuOpenFor = this.listMenuOpenFor === listId ? null : listId;
  }

  startAddingList() {
    this.showAddList = true;
    this.newListName = '';
  }

  confirmAddList() {
    const name = this.newListName.trim();
    if (!name || !this.selectedBoard) return;

    this.trelloService.createList(this.selectedBoard.id, name).subscribe({
      next: (response) => {
        this.lists.push(response.data);
        this.newListName = '';
        this.showAddList = false;
      },
      error: (error) => {
        console.error('Error creando lista:', error);
        alert(error?.error?.message || 'No fue posible crear la lista.');
      }
    });
  }

  archiveList(list: TrelloList) {
    if (!confirm(`¿Archivar la lista "${list.name}" y todas sus tarjetas?`)) return;

    this.trelloService.archiveList(list.id).subscribe({
      next: () => {
        this.lists = this.lists.filter(l => l.id !== list.id);
        this.cards = this.cards.filter(c => c.idList !== list.id);
        this.listMenuOpenFor = null;
      },
      error: (error) => {
        console.error('Error archivando lista:', error);
        alert(error?.error?.message || 'No fue posible archivar la lista.');
      }
    });
  }

  // ---------- Drag and drop nativo ----------

  onDragStart(event: DragEvent, card: TrelloCard) {
    this.draggedCard = card;
    event.dataTransfer?.setData('text/plain', card.id);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  onDrop(event: DragEvent, targetListId: string) {
    event.preventDefault();
    if (!this.draggedCard || this.draggedCard.idList === targetListId) {
      this.draggedCard = null;
      return;
    }

    const card = this.draggedCard;
    const previousListId = card.idList;

    card.idList = targetListId;
    this.draggedCard = null;

    this.trelloService.moveCard(card.id, targetListId).subscribe({
      error: (error) => {
        console.error('Error moviendo tarjeta:', error);
        card.idList = previousListId;
        alert(error?.error?.message || 'No fue posible mover la tarjeta.');
      }
    });
  }

  // ---------- Fondo del tablero ----------

  private storageKey(boardId: string): string {
    return `trello-bg-${boardId}`;
  }

  private loadBoardBackground(): void {
    this.stopParticles();
    if (!this.selectedBoard) return;

    const stored = localStorage.getItem(this.storageKey(this.selectedBoard.id)) as BoardBackground | null;
    this.currentBackground = stored || 'particles';

    if (this.currentBackground === 'particles') {
      // el canvas todavía no existe en el DOM hasta el próximo ciclo de detección
      setTimeout(() => this.startParticles(), 0);
    }
  }

  toggleBackgroundPicker(): void {
    this.showBackgroundPicker = !this.showBackgroundPicker;
  }

  selectBackground(bg: BoardBackground): void {
    this.currentBackground = bg;
    this.showBackgroundPicker = false;

    if (this.selectedBoard) {
      localStorage.setItem(this.storageKey(this.selectedBoard.id), bg);
    }

    if (bg === 'particles') {
      setTimeout(() => this.startParticles(), 0);
    } else {
      this.stopParticles();
    }
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

    const count = 55;
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.6,
    }));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const linkDistance = 130;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139, 124, 246, 0.85)';
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
            ctx.strokeStyle = `rgba(76, 63, 201, ${opacity * 0.4})`;
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

  // ============ SEÑALIZADOR DE CAMBIOS RECIENTES ============

  hasRecentChange(card: TrelloCard): boolean {
    return !!card && this.recentNotifications.some((n) => n.cardId === card.id);
  }

  latestChange(card: TrelloCard): any | null {
    return this.recentNotifications.find((n) => n.cardId === card.id) || null;
  }

  changedCardIds(): Set<string> {
    return new Set(this.recentNotifications.map((n) => n.cardId));
  }

  recentChangesHere(): any[] {
    if (!this.selectedBoard) return [];
    return this.recentNotifications.filter((n) => n.boardId === this.selectedBoard?.id);
  }

  cardClass(card: TrelloCard): string {
    const base = 'group relative bg-white rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all';
    if (this.hasRecentChange(card)) {
      return `${base} border-2 border-amber-400 ring-2 ring-amber-400/50`;
    }
    return `${base} border border-ink-950/5`;
  }

  openChange(n: any): void {
    if (n?.cardId) this.trelloNotif.acknowledge(n.cardId);
    const card = this.cards.find((c) => c.id === n?.cardId);
    if (card) {
      this.openCard(card);
      return;
    }
    if (n?.cardUrl) window.open(n.cardUrl, '_blank');
  }

  clearChangeMarkers(): void {
    this.trelloNotif.clear();
  }
}