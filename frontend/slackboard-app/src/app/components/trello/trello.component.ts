import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { TrelloService } from '../../services/trello.service';
import { AuthService } from '../../services/auth.service';

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
  setupApiKey = '';
  setupToken = '';
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
  loadingActions = false;
  newComment = '';
  sendingComment = false;

  lightboxUrl: string | null = null;

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

  constructor(private trelloService: TrelloService, private authService: AuthService) {}

  ngOnInit() {
    this.checkTrelloStatus();
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
    if (!this.setupApiKey.trim() || !this.setupToken.trim()) {
      this.setupError = 'Se requiere API Key y Token de Trello';
      return;
    }
    this.setupLoading = true;
    this.setupError = null;
    this.authService.linkTrello(this.setupApiKey.trim(), this.setupToken.trim()).subscribe({
      next: () => {
        this.trelloLinked = true;
        this.showSetup = false;
        this.setupLoading = false;
        this.loadBoards();
      },
      error: (err) => {
        this.setupLoading = false;
        this.setupError = err?.error?.message || 'Error al vincular Trello';
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
      }
    });
  }

  loadBoards() {
    this.loadingBoards = true;
    this.trelloService.getBoards().subscribe({
      next: (response) => {
        this.boards = (response.data || []).filter((b: TrelloBoard) => !b.closed);
        this.loadingBoards = false;
        if (this.boards.length > 0) {
          this.selectBoard(this.boards[0]);
        }
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

  selectBoard(board: TrelloBoard) {
    this.selectedBoard = board;
    this.showBoardPicker = false;
    this.loadBoardContents();
    this.loadBoardBackground();
  }

  loadBoardContents() {
    if (!this.selectedBoard) return;
    this.loadingBoard = true;
    this.lists = [];
    this.cards = [];
    this.boardLabels = [];
    this.boardMembers = [];

    this.trelloService.getBoardContents(this.selectedBoard.id).subscribe({
      next: (response) => {
        this.lists = (response.data.lists || []).sort((a: TrelloList, b: TrelloList) => a.pos - b.pos);
        this.cards = (response.data.cards || []).filter((c: TrelloCard) => !c.closed);
        this.boardMembers = response.data.members || [];
        this.loadingBoard = false;
      },
      error: (error) => {
        console.error('Error cargando el tablero:', error);
        this.loadingBoard = false;
      }
    });

    this.trelloService.getBoardLabels(this.selectedBoard.id).subscribe({
      next: (response) => {
        this.boardLabels = response.data || [];
      },
      error: (error) => {
        console.error('Error cargando etiquetas:', error);
      }
    });
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
    if (!member.avatarHash) return '';
    return `https://trello.com/1/thumb/${member.avatarHash}/30.png`;
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
    if (url) this.lightboxUrl = url;
  }

  closeLightbox() {
    this.lightboxUrl = null;
  }

  // ---------- Comment image parsing ----------

  commentHasImages(action: any): boolean {
    const text = action?.data?.text || '';
    return /\.(png|jpe?g|gif|webp|svg)(\?[^)]*)?$/i.test(text.trim());
  }

  commentImageUrl(action: any): string {
    return (action?.data?.text || '').trim();
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

  commentText(action: any): string {
    return action?.data?.text || '';
  }

  actionAuthor(action: any): string {
    return action?.memberCreator?.fullName || action?.memberCreator?.username || 'Alguien';
  }

  actionAuthorAvatar(action: any): string {
    const hash = action?.memberCreator?.avatarHash;
    if (!hash) return '';
    return `https://trello.com/1/thumb/${hash}/30.png`;
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

  // ← NUEVO: URL segura para <img src> — adjuntos subidos van por nuestro
  // proxy autenticado; adjuntos tipo "link externo" se muestran directo.
  attachmentSrc(attachment: any): string {
    if (this.selectedCard && (attachment.isUpload || this.isTrelloHosted(attachment.url))) {
      return this.trelloService.getAttachmentViewUrl(this.selectedCard.id, attachment.id);
    }
    return attachment.url;
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
}