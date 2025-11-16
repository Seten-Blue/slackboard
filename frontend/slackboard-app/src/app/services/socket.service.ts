import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket;
  private readonly uri: string = 'http://localhost:3000';

  constructor() {
    this.socket = io(this.uri, {
      transports: ['websocket', 'polling']
    });
  }

  // Conectar al socket
  connect(): void {
    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  // Desconectar
  disconnect(): void {
    if (this.socket.connected) {
      this.socket.disconnect();
    }
  }

  // Unirse a un canal
  joinChannel(channelId: string): void {
    this.socket.emit('join-channel', channelId);
  }

  // Enviar mensaje
  sendMessage(data: any): void {
    this.socket.emit('send-message', data);
  }

  // Escuchar nuevos mensajes
  onNewMessage(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('new-message', (data) => {
        observer.next(data);
      });
    });
  }

  // Notificar que el usuario está escribiendo
  sendTyping(data: any): void {
    this.socket.emit('typing', data);
  }

  // Escuchar cuando alguien está escribiendo
  onUserTyping(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('user-typing', (data) => {
        observer.next(data);
      });
    });
  }

  // Verificar conexión
  isConnected(): boolean {
    return this.socket.connected;
  }
}
