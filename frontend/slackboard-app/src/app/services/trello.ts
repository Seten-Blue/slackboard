import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TrelloService {
	private apiUrl = '/api/trello';

	constructor(private http: HttpClient) {}

	getBoards(): Observable<any> {
		return this.http.get<any>(`${this.apiUrl}/boards`);
	}

	getBoardActions(boardId: string, limit: number = 20) {
		return this.http.get<any>(`${this.apiUrl}/boards/${boardId}/actions?limit=${limit}`);
	}
	getBoardCards(boardId: string) {
		return this.http.get<any>(`${this.apiUrl}/boards/${boardId}/cards`);
	}
}
