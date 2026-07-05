import { Component, OnInit } from '@angular/core';
import { TrelloService } from '../../services/trello.service';

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
}

// Paleta aproximada de los colores de etiqueta de Trello
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

@Component({
  selector: 'app-trello',
  templateUrl: './trello.component.html',
  styleUrls: ['./trello.component.scss']
})
export class TrelloComponent implements OnInit {
  boards: TrelloBoard[] = [];
  selectedBoard: TrelloBoard | null = null;
  lists: TrelloList[] = [];
  cards: TrelloCard[] = [];
  boardLabels: any[] = [];

  loadingBoards = true;
  loadingBoard = false;
  showBoardPicker = false;

  addingCardToList: string | null = null;
  newCardName = '';

  selectedCard: TrelloCard | null = null;
  editedCardName = '';
  editedCardDesc = '';
  editedCardDue = '';
  editedCardDueComplete = false;
  savingCard = false;

  selectedCardAttachments: any[] = [];
  loadingAttachments = false;
  newAttachmentUrl = '';
  uploadingFile = false;

  showAddList = false;
  newListName = '';
  listMenuOpenFor: string | null = null;

  private draggedCard: TrelloCard | null = null;

  constructor(private trelloService: TrelloService) {}

  ngOnInit() {
    this.loadBoards();
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
      }
    });
  }

  selectBoard(board: TrelloBoard) {
    this.selectedBoard = board;
    this.showBoardPicker = false;
    this.loadBoardContents();
  }

  loadBoardContents() {
    if (!this.selectedBoard) return;
    this.loadingBoard = true;
    this.lists = [];
    this.cards = [];
    this.boardLabels = [];

    this.trelloService.getBoardContents(this.selectedBoard.id).subscribe({
      next: (response) => {
        this.lists = (response.data.lists || []).sort((a: TrelloList, b: TrelloList) => a.pos - b.pos);
        this.cards = (response.data.cards || []).filter((c: TrelloCard) => !c.closed);
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
  }

  closeCardPanel() {
    this.selectedCard = null;
    this.selectedCardAttachments = [];
    this.newAttachmentUrl = '';
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

  isImageAttachment(attachment: any): boolean {
    return /\.(png|jpe?g|gif|webp|svg)$/i.test(attachment.url || '');
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
}