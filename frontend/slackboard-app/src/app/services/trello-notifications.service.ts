import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface TrelloNotification {
  id: number;
  actionId: string;
  cardId: string;
  boardId: string;
  boardName: string;
  cardName: string;
  title: string;
  detail: string;
  cardUrl: string;
  actorName: string;
  ts: string;
  read: boolean;
}

const LS_KEY = 'slackboard-trello-notifs';

@Injectable({
  providedIn: 'root'
})
export class TrelloNotificationsService {
  private _count = new BehaviorSubject<number>(0);
  private _list = new BehaviorSubject<TrelloNotification[]>([]);

  readonly count$ = this._count.asObservable();
  readonly list$ = this._list.asObservable();

  private store: TrelloNotification[] = [];

  constructor() {
    this.hydrate();
  }

  push(data: any): TrelloNotification {
    const actionId = data?.actionId || '';
    const ts = data?.ts || '';
    /* Dedupe: si esta misma accion de Trello ya fue guardada, no la clonamos. */
    const exists = this.store.some(
      (n) => (actionId && n.actionId === actionId) || (!actionId && n.cardId === data?.cardId && n.ts === ts),
    );
    if (exists) return this.store[0];

    const item: TrelloNotification = {
      id: Date.now() + Math.random(),
      actionId: actionId || `${data?.cardId || ''}|${ts}`,
      cardId: data?.cardId || '',
      boardId: data?.boardId || '',
      boardName: data?.boardName || '',
      cardName: data?.cardName || '',
      title: data?.title || 'Cambio en el tablero de Trello',
      detail: data?.detail || '',
      cardUrl: data?.cardUrl || '',
      actorName: data?.actorName || '',
      ts,
      read: false,
    };
    this.store.unshift(item);
    if (this.store.length > 30) this.store.pop();
    this.emit();
    return item;
  }

  markRead(): void {
    if (!this.store.some((n) => !n.read)) return;
    this.store.forEach((n) => (n.read = true));
    this.emit();
  }

  acknowledge(cardId: string): void {
    const before = this.store.length;
    this.store = this.store.filter((n) => n.cardId !== cardId);
    if (this.store.length !== before) this.emit();
  }

  clear(): void {
    this.store = [];
    this.emit();
  }

  private emit(): void {
    this._count.next(this.store.filter((n) => !n.read).length);
    this._list.next([...this.store]);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.store));
    } catch {
      // ignorar
    }
  }

  private hydrate(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) this.store = parsed;
    } catch {
      this.store = [];
    }
    this.emit();
  }
}