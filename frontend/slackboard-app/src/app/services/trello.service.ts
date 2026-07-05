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

  getBoardLabels(boardId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/trello/boards/${boardId}/labels`);
  }

  createList(boardId: string, name: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/trello/boards/${boardId}/lists`, { name });
  }

  archiveList(listId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/lists/${listId}/archive`, {});
  }

  createCard(listId: string, name: string, desc?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/trello/cards`, { listId, name, desc });
  }

  updateCard(cardId: string, data: { name?: string; desc?: string; due?: string | null; dueComplete?: boolean }): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/cards/${cardId}`, data);
  }

  moveCard(cardId: string, listId: string, pos?: string | number): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/cards/${cardId}/move`, { listId, pos });
  }

  archiveCard(cardId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/trello/cards/${cardId}/archive`, {});
  }

  toggleCardLabel(cardId: string, labelId: string, action: 'add' | 'remove'): Observable<any> {
    return this.http.post(`${this.apiUrl}/trello/cards/${cardId}/labels/${labelId}`, { action });
  }

  getAttachments(cardId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/trello/cards/${cardId}/attachments`);
  }

  addAttachmentUrl(cardId: string, url: string, name?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/trello/cards/${cardId}/attachments/url`, { url, name });
  }

  uploadAttachment(cardId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/trello/cards/${cardId}/attachments/file`, formData);
  }
}