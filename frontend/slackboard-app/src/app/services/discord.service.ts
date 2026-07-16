import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DiscordService {
  private apiUrl = `${environment.apiUrl}/discord/oauth`;

  constructor(private http: HttpClient) {}

  getStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/status`);
  }

  startOAuth(): Observable<any> {
    return this.http.get(`${this.apiUrl}/start`);
  }

  getMyGuilds(): Observable<any> {
    return this.http.get(`${this.apiUrl}/my-guilds`);
  }

  syncGuild(guildId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/sync-guild`, { guildId });
  }
}