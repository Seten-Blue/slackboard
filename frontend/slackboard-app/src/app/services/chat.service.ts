import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = 'http://localhost:3000/api';

  private currentChannelSubject = new BehaviorSubject<any>(null);
  public currentChannel$ = this.currentChannelSubject.asObservable();

  private refreshChannelsSubject = new Subject<void>();
  public refreshChannels$ = this.refreshChannelsSubject.asObservable();

  triggerChannelsRefresh(): void {
    this.refreshChannelsSubject.next();
  }

  constructor(private http: HttpClient, private authService: AuthService) {}

  // 🔹 Nuevo metodo para subir archivos
  uploadAttachment(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/upload`, formData);
  }

  getChannels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels`);
  }

  getChannelById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels/${id}`);
  }

  createChannel(channelData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/channels`, {
      ...channelData,
      createdBy: this.authService.currentUser?._id
    });
  }

  getOrCreateAIChannel(): Observable<any> {
    return this.http.post(`${this.apiUrl}/ai/channel`, {});
  }

  updateChannel(channelId: string, channelData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/channels/${channelId}`, channelData);
  }

  leaveChannel(channelId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/channels/${channelId}/leave`, {});
  }

  deleteChannel(channelId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/channels/${channelId}`);
  }

  syncPlatformChannels(platform: string): Observable<any> {
    const supported: Record<string, string> = {
      slack: `${this.apiUrl}/slack/sync-channels`,
      discord: `${this.apiUrl}/discord/sync-channels`,
    };

    const url = supported[platform];
    if (!url) {
      return new Observable(observer => {
        observer.error({ error: { message: `Sincronizacion aun no disponible para "${platform}".` } });
      });
    }

    return this.http.post(url, {});
  }

  getMessagesByChannel(channelId: string, limit = 50, skip = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/channel/${channelId}?limit=${limit}&skip=${skip}`);
  }

  sendMessage(messageData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages`, {
      ...messageData,
      sender: this.authService.currentUser?._id
    });
  }

  updateMessage(messageId: string, content: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/messages/${messageId}`, { content });
  }

  deleteMessage(messageId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`);
  }

  addReaction(messageId: string, emoji: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/${messageId}/reaction`, {
      emoji,
      userId: this.authService.currentUser?._id
    });
  }

  votePoll(messageId: string, optionIndex: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/${messageId}/poll/vote`, {
      optionIndex
    });
  }

  replyToThread(messageId: string, content: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/${messageId}/reply`, {
      content,
      sender: this.authService.currentUser?._id
    });
  }

  getThreadReplies(messageId: string, limit = 50, skip = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/thread/${messageId}/replies?limit=${limit}&skip=${skip}`);
  }

  setCurrentChannel(channel: any): void {
    this.currentChannelSubject.next(channel);
  }

  getCurrentUser(): any {
    return this.authService.currentUser;
  }
}
