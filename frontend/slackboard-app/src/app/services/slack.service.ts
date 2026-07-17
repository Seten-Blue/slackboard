import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SlackService {
  private apiUrl = `${environment.apiUrl}/slack/oauth`;

  constructor(private http: HttpClient) {}

  getStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/status`);
  }

  startOAuth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/start`);
  }

  syncWorkspace(teamId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/sync-workspace`, { teamId });
  }

}