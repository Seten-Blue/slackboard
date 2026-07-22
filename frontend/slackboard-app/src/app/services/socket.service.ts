import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private newMessage$ = new Subject<any>();
  private messageUpdated$ = new Subject<any>();
  private messageDeleted$ = new Subject<any>();
  private messageReaction$ = new Subject<any>();
  private userTyping$ = new Subject<any>();
  private connected$ = new Subject<void>();

  private listenersAttached = false;

  constructor(private authService: AuthService) {}

  connect() {
    if (this.socket?.connected) return;

    const token = this.authService.token;
    const opts: any = {
      transports: ['websocket', 'polling'],
    };
    if (token) {
      opts.auth = { token };
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(environment.socketUrl, opts);

    this.socket.on('connect', () => {
      console.log('✅ Conectado a Socket.IO');
      this.connected$.next();
      this.attachListeners();
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Desconectado de Socket.IO');
    });

    this.socket.on('connect_error', (err) => {
      console.error('⚠️ Error de conexion Socket.IO:', err.message);
    });

    this.attachListeners();
  }

  private attachListeners() {
    if (!this.socket || this.listenersAttached) return;

    this.socket.on('new-message', (data: any) => this.newMessage$.next(data));
    this.socket.on('message-updated', (data: any) => this.messageUpdated$.next(data));
    this.socket.on('message-deleted', (data: any) => this.messageDeleted$.next(data));
    this.socket.on('message-reaction', (data: any) => this.messageReaction$.next(data));
    this.socket.on('user-typing', (data: any) => this.userTyping$.next(data));

    this.listenersAttached = true;
  }

  joinChannel(channelId: string) {
    if (this.socket?.connected) {
      this.socket.emit('join-channel', channelId);
    }
  }

  sendMessage(data: any) {
    if (this.socket?.connected) {
      this.socket.emit('send-message', data);
    }
  }

  onNewMessage(): Observable<any> {
    return this.newMessage$.asObservable();
  }

  onMessageUpdated(): Observable<any> {
    return this.messageUpdated$.asObservable();
  }

  onMessageDeleted(): Observable<any> {
    return this.messageDeleted$.asObservable();
  }

  onMessageReaction(): Observable<any> {
    return this.messageReaction$.asObservable();
  }

  sendTyping(data: any) {
    if (this.socket?.connected) {
      this.socket.emit('typing', data);
    }
  }

  onUserTyping(): Observable<any> {
    return this.userTyping$.asObservable();
  }

  onConnected(): Observable<any> {
    return this.connected$.asObservable();
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.listenersAttached = false;
    }
  }
}
