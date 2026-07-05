import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TrelloService {
  private apiUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getBoards(): Observable<any> {
    return this.http.get(`${this.apiUrl}/trello/boards`);
  }

  getBoardContents(boardId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/trello/boards/${boardId}`);
  }

  createList(boardId: string, name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/trello/boards/${boardId}/lists`, { name });
  }

  createCard(listId: string, name: string, desc?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/trello/cards`, { listId, name, desc });
  }

  updateCard(cardId: string, data: { name?: string; desc?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/cards/${cardId}`, data);
  }

  moveCard(cardId: string, listId: string, pos?: string | number): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/cards/${cardId}/move`, { listId, pos });
  }

  archiveCard(cardId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/cards/${cardId}/archive`, {});
  }
}