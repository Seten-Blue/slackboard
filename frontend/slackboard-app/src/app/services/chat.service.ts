import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = 'http://localhost:3000/api';
  
  private currentChannelSubject = new BehaviorSubject<any>(null);
  public currentChannel$ = this.currentChannelSubject.asObservable();

  private currentUser = {
    _id: '69196dd00a60b097f35f3587',
    username: 'Admin',
    email: 'admin@slackboard.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'
  };

  constructor(private http: HttpClient) {}

  getChannels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels`);
  }

  getChannelById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels/${id}`);
  }

  createChannel(channelData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/channels`, {
      ...channelData,
      createdBy: this.currentUser._id
    });
  }

  getMessagesByChannel(channelId: string, limit = 50, skip = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/channel/${channelId}?limit=${limit}&skip=${skip}`);
  }

  sendMessage(messageData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages`, {
      ...messageData,
      sender: this.currentUser._id
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
      userId: this.currentUser._id
    });
  }

  setCurrentChannel(channel: any): void {
    this.currentChannelSubject.next(channel);
  }

  getCurrentUser(): any {
    return this.currentUser;
  }
}
