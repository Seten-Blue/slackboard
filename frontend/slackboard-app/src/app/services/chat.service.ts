import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

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
  private socketUrl = 'http://localhost:3000';
  private socket: Socket;
  
  private currentChannelSubject = new BehaviorSubject<Channel | null>(null);
  public currentChannel$ = this.currentChannelSubject.asObservable();
  
  // BehaviorSubject para mensajes en tiempo real
  private messagesSubject = new BehaviorSubject<Message[]>([]);
  public messages$ = this.messagesSubject.asObservable();
  
  private currentUser: any;

  constructor(private http: HttpClient) {
    // Inicializar Socket.IO
    this.socket = io(this.socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    this.setupSocketListeners();
    this.initializeCurrentUser();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket.IO desconectado');
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Error de conexión Socket.IO:', error);
    });

    // Escuchar nuevos mensajes
    this.socket.on('newMessage', (message: Message) => {
      console.log('📨 Nuevo mensaje recibido:', message);
      const currentMessages = this.messagesSubject.value;
      this.messagesSubject.next([...currentMessages, message]);
    });

    // Escuchar usuario escribiendo
    this.socket.on('user-typing', (data: any) => {
      console.log('✍️ Usuario escribiendo:', data);
    });
  }

  private async initializeCurrentUser() {
    try {
      const response: any = await this.http.get(`${this.apiUrl}/channels`).toPromise();
      
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
    
    // Usuario por defecto
    this.currentUser = {
      _id: '691a782cae6f4b98118e1ebd', // ID del admin que ya existe
      username: 'Admin',
      email: 'admin@slackboard.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
    };
  }

  getCurrentUser(): any {
    return this.currentUser;
  }

  setCurrentChannel(channel: Channel | null) {
    this.currentChannelSubject.next(channel);
    
    if (channel) {
      // Unirse al canal en Socket.IO
      this.socket.emit('join-channel', channel._id);
      console.log('🔗 Unido al canal:', channel._id);
      
      // Cargar mensajes del canal
      this.loadChannelMessages(channel._id);
    }
  }

  private loadChannelMessages(channelId: string) {
    this.getMessagesByChannel(channelId).subscribe({
      next: (response) => {
        this.messagesSubject.next(response.data || []);
      },
      error: (error) => {
        console.error('Error cargando mensajes:', error);
        this.messagesSubject.next([]);
      }
    });
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
    const fullMessageData = {
      content: messageData.content,
      channel: messageData.channel,
      type: messageData.type || 'text',
      sender: this.currentUser._id
    };
    
    console.log('📤 Enviando mensaje:', fullMessageData);
    
    return this.http.post(`${this.apiUrl}/messages`, fullMessageData);
  }

  notifyTyping(channelId: string) {
    this.socket.emit('typing', {
      channelId: channelId,
      username: this.currentUser.username
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

  // Limpiar al destruir el servicio
  ngOnDestroy() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}