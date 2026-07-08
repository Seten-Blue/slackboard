import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;

  constructor() {}

  connect() {
    if (!this.socket) {
      this.socket = io(environment.socketUrl, {
        transports: ['websocket', 'polling']
      });
      
      this.socket.on('connect', () => {
        console.log('✅ Conectado a Socket.IO');
      });

      this.socket.on('disconnect', () => {
        console.log('❌ Desconectado de Socket.IO');
      });
    }
  }

  joinChannel(channelId: string) {
    if (this.socket) {
      this.socket.emit('join-channel', channelId);
    }
  }

  sendMessage(data: any) {
    if (this.socket) {
      this.socket.emit('send-message', data);
    }
  }

  onNewMessage(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('new-message', (data: any) => {
          observer.next(data);
        });
      }
    });
  }

  // ← NUEVO: una plataforma (Discord por ahora) edita un mensaje ya guardado
  onMessageUpdated(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('message-updated', (data: any) => {
          observer.next(data);
        });
      }
    });
  }

  // ← NUEVO: una plataforma borra un mensaje ya guardado
  onMessageDeleted(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('message-deleted', (data: any) => {
          observer.next(data);
        });
      }
    });
  }

  // ← NUEVO: se agrega/quita una reacción desde la plataforma externa
  onMessageReaction(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('message-reaction', (data: any) => {
          observer.next(data);
        });
      }
    });
  }

  sendTyping(data: any) {
    if (this.socket) {
      this.socket.emit('typing', data);
    }
  }

  onUserTyping(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('user-typing', (data: any) => {
          observer.next(data);
        });
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}