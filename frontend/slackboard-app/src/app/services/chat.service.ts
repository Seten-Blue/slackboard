import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

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
  // Usar variables de entorno
  private apiUrl = environment.apiUrl || 'http://localhost:3000/api';
  private socketUrl = environment.socketUrl || 'http://localhost:3000';
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
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 10000
    });

    this.setupSocketListeners();
    this.initializeCurrentUser();
  }

  private setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('✅ Socket.IO conectado:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket.IO desconectado:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Error de conexión Socket.IO:', error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Socket.IO reconectado después de', attemptNumber, 'intentos');
    });

    // Escuchar nuevos mensajes
    this.socket.on('newMessage', (message: Message) => {
      console.log('📨 Nuevo mensaje recibido por Socket.IO:', message);
      const currentMessages = this.messagesSubject.value;
      
      // Evitar duplicados
      const exists = currentMessages.some(m => m._id === message._id);
      if (!exists) {
        this.messagesSubject.next([...currentMessages, message]);
      }
    });

    // Escuchar usuario escribiendo
    this.socket.on('user-typing', (data: any) => {
      console.log('✍️ Usuario escribiendo:', data);
    });

    this.socket.on('user-stop-typing', (data: any) => {
      console.log('⏹️ Usuario dejó de escribir:', data);
    });

    // Escuchar actualizaciones de mensajes
    this.socket.on('message-updated', (updatedMessage: Message) => {
      console.log('📝 Mensaje actualizado:', updatedMessage);
      const currentMessages = this.messagesSubject.value;
      const index = currentMessages.findIndex(m => m._id === updatedMessage._id);
      if (index !== -1) {
        currentMessages[index] = updatedMessage;
        this.messagesSubject.next([...currentMessages]);
      }
    });

    // Escuchar eliminación de mensajes
    this.socket.on('message-deleted', (data: any) => {
      console.log('🗑️ Mensaje eliminado:', data);
      const currentMessages = this.messagesSubject.value;
      this.messagesSubject.next(currentMessages.filter(m => m._id !== data.messageId));
    });

    // Escuchar reacciones
    this.socket.on('reaction-added', (data: any) => {
      console.log('👍 Reacción agregada:', data);
      const currentMessages = this.messagesSubject.value;
      const index = currentMessages.findIndex(m => m._id === data.messageId);
      if (index !== -1 && data.message) {
        currentMessages[index] = data.message;
        this.messagesSubject.next([...currentMessages]);
      }
    });
  }

  private async initializeCurrentUser() {
    // Intentar cargar desde localStorage primero
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
        console.log('✅ Usuario cargado desde localStorage:', this.currentUser);
        return;
      } catch (error) {
        console.error('Error parseando usuario de localStorage:', error);
      }
    }

    // Intentar obtener desde el backend
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
          
          // Guardar en localStorage
          localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
          console.log('✅ Usuario actual establecido desde backend:', this.currentUser);
          return;
        }
      }
    } catch (error) {
      console.error('❌ Error obteniendo usuario del backend:', error);
    }
    
    // Usuario por defecto como última opción
this.currentUser = {
  _id: '691ba00b9d2730a0d0d4aa18',       username: 'Admin',
      email: 'admin@slackboard.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'
    };
    
    // Guardar en localStorage
    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    console.log('⚠️ Usuario por defecto establecido:', this.currentUser);
  }

  getCurrentUser(): any {
    return this.currentUser;
  }

  setCurrentUser(user: any) {
    this.currentUser = user;
    localStorage.setItem('currentUser', JSON.stringify(user));
    console.log('✅ Usuario actualizado:', user);
  }

  setCurrentChannel(channel: Channel | null) {
    const previousChannel = this.currentChannelSubject.value;
    
    // Salir del canal anterior
    if (previousChannel) {
      this.socket.emit('leave-channel', previousChannel._id);
      console.log('👋 Saliendo del canal:', previousChannel.name);
    }
    
    this.currentChannelSubject.next(channel);
    
    if (channel) {
      // Unirse al canal en Socket.IO
      this.socket.emit('join-channel', channel._id);
      console.log('🔗 Unido al canal:', channel.name);
      
      // Cargar mensajes del canal
      this.loadChannelMessages(channel._id);
    }
  }

  private loadChannelMessages(channelId: string) {
    this.getMessagesByChannel(channelId).subscribe({
      next: (response) => {
        console.log('📥 Mensajes cargados:', response.data?.length || 0);
        this.messagesSubject.next(response.data || []);
      },
      error: (error) => {
        console.error('❌ Error cargando mensajes:', error);
        this.messagesSubject.next([]);
      }
    });
  }

  // ========================================
  // MÉTODOS HTTP
  // ========================================

  getChannels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels`);
  }

  createChannel(channelData: any): Observable<any> {
    const data = {
      ...channelData,
      createdBy: this.currentUser._id
    };
    return this.http.post(`${this.apiUrl}/channels`, data);
  }

  getMessagesByChannel(channelId: string, limit: number = 50, skip: number = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/channel/${channelId}?limit=${limit}&skip=${skip}`);
  }

  sendMessage(messageData: any): Observable<any> {
    const fullMessageData = {
      content: messageData.content,
      channel: messageData.channel,
      type: messageData.type || 'text',
      sender: messageData.sender || this.currentUser._id
    };
    
    console.log('📤 Enviando mensaje al backend:', fullMessageData);
    
    return this.http.post(`${this.apiUrl}/messages`, fullMessageData);
  }

  updateMessage(messageId: string, content: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/messages/${messageId}`, { content });
  }

  deleteMessage(messageId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`);
  }

  addReaction(messageId: string, emoji: string, userId?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/${messageId}/reaction`, {
      emoji,
      userId: userId || this.currentUser._id
    });
  }

  addMemberToChannel(channelId: string, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/channels/add-member`, {
      channelId,
      userId
    });
  }

  // ========================================
  // MÉTODOS SOCKET.IO
  // ========================================

  notifyTyping(channelId: string, userId?: string, username?: string) {
    this.socket.emit('typing', {
      channelId: channelId,
      userId: userId || this.currentUser._id,
      username: username || this.currentUser.username
    });
  }

  notifyStopTyping(channelId: string, userId?: string) {
    this.socket.emit('stop-typing', {
      channelId: channelId,
      userId: userId || this.currentUser._id
    });
  }

  joinChannel(channelId: string) {
    this.socket.emit('join-channel', channelId);
  }

  leaveChannel(channelId: string) {
    this.socket.emit('leave-channel', channelId);
  }

  isSocketConnected(): boolean {
    return this.socket && this.socket.connected;
  }

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // Limpiar al destruir el servicio
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('👋 Socket.IO desconectado manualmente');
    }
  }
}
