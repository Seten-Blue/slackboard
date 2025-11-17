import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

export interface Channel {
  _id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  members: string[];
  createdAt: Date;
}

export interface Message {
  _id: string;
  content: string;
  channel: string;
  sender: {
    _id: string;
    username: string;
    email: string;
    avatar: string;
    status: string;
  };
  type: string;
  isEdited: boolean;
  reactions: any[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = 'http://localhost:3000/api';
  private currentChannelSubject = new BehaviorSubject<Channel | null>(null);
  public currentChannel$ = this.currentChannelSubject.asObservable();
  
  private currentUser: any;

  constructor(private http: HttpClient) {
    // Inicializar usuario actual
    this.initializeCurrentUser();
  }

  private async initializeCurrentUser() {
    try {
      // Intentar obtener el primer usuario de la base de datos
      const response: any = await this.http.get(`${this.apiUrl}/channels`).toPromise();
      
      // Si hay canales, obtener un usuario de los miembros
      if (response.data && response.data.length > 0) {
        const firstChannel = response.data[0];
        if (firstChannel.members && firstChannel.members.length > 0) {
          const firstMember = firstChannel.members[0];
          this.currentUser = {
            _id: firstMember._id || firstMember,
            username: firstMember.username || 'Admin',
            email: firstMember.email || 'admin@slackboard.com',
            avatar: firstMember.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'
          };
          console.log('✅ Usuario actual establecido:', this.currentUser);
          return;
        }
      }
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
    }

    // Usuario por defecto si falla
    this.currentUser = {
      _id: '000000000000000000000000', // ID temporal
      username: 'Admin',
      email: 'admin@slackboard.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'
    };
  }

  getCurrentUser(): any {
    return this.currentUser;
  }

  setCurrentChannel(channel: Channel | null) {
    this.currentChannelSubject.next(channel);
  }

  getChannels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels`);
  }

  createChannel(channelData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/channels`, channelData);
  }

  getMessagesByChannel(channelId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/channel/${channelId}`);
  }

  sendMessage(messageData: any): Observable<any> {
    // Asegurarse de que el mensaje tenga el sender
    const fullMessageData = {
      content: messageData.content,
      channel: messageData.channel,
      type: messageData.type || 'text',
      sender: this.currentUser._id
    };

    console.log('📤 Enviando mensaje:', fullMessageData);
    
    return this.http.post(`${this.apiUrl}/messages`, fullMessageData);
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
}