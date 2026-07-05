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
}

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

  loadingBoards = true;
  loadingBoard = false;
  showBoardPicker = false;

  addingCardToList: string | null = null;
  newCardName = '';

  selectedCard: TrelloCard | null = null;
  editedCardName = '';
  editedCardDesc = '';
  savingCard = false;

  showAddList = false;
  newListName = '';

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
  }

  cardsInList(listId: string): TrelloCard[] {
    return this.cards
      .filter(c => c.idList === listId)
      .sort((a, b) => a.pos - b.pos);
  }

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
  }

  closeCardPanel() {
    this.selectedCard = null;
  }

  saveCard() {
    if (!this.selectedCard || this.savingCard) return;
    const name = this.editedCardName.trim();
    if (!name) return;

    this.savingCard = true;
    this.trelloService.updateCard(this.selectedCard.id, { name, desc: this.editedCardDesc }).subscribe({
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
          this.selectedCard = null;
        }
      },
      error: (error) => {
        console.error('Error archivando tarjeta:', error);
        alert(error?.error?.message || 'No fue posible archivar la tarjeta.');
      }
    });
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

  // Drag and drop nativo — sin dependencias nuevas
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

    // Actualización optimista: se mueve visualmente al instante
    card.idList = targetListId;
    this.draggedCard = null;

    this.trelloService.moveCard(card.id, targetListId).subscribe({
      error: (error) => {
        console.error('Error moviendo tarjeta:', error);
        card.idList = previousListId; // revertir si Trello lo rechaza
        alert(error?.error?.message || 'No fue posible mover la tarjeta.');
      }
    });
  }
}