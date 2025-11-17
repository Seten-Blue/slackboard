import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();

  constructor() {}

  connect(): void {
    if (this.socket && this.socket.connected) {
      console.log('🔌 Socket ya está conectado');
      return;
    }

    this.socket = io(environment.socketUrl || 'http://localhost:3000', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket conectado:', this.socket?.id);
      this.connectedSubject.next(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket desconectado:', reason);
      this.connectedSubject.next(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Error de conexión Socket.IO:', error);
      this.connectedSubject.next(false);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Socket reconectado después de', attemptNumber, 'intentos');
      this.connectedSubject.next(true);
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Intento de reconexión:', attemptNumber);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ Error de reconexión:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ Reconexión fallida');
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectedSubject.next(false);
      console.log('👋 Socket desconectado manualmente');
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }

  // ===========================================
  // MÉTODOS DE CANAL
  // ===========================================

  joinChannel(channelId: string): void {
    if (this.socket && channelId) {
      this.socket.emit('join-channel', channelId);
      console.log(`✅ Unido al canal: ${channelId}`);
    } else {
      console.warn('⚠️ No se puede unir al canal: Socket no conectado');
    }
  }

  leaveChannel(channelId: string): void {
    if (this.socket && channelId) {
      this.socket.emit('leave-channel', channelId);
      console.log(`👋 Salió del canal: ${channelId}`);
    }
  }

  // ===========================================
  // MÉTODOS DE MENSAJES
  // ===========================================

  sendMessage(data: any): void {
    if (this.socket) {
      this.socket.emit('send-message', data);
      console.log('📤 Mensaje enviado por Socket.IO:', data);
    } else {
      console.error('❌ No se puede enviar mensaje: Socket no conectado');
    }
  }

  onNewMessage(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('newMessage', (data: any) => {
          console.log('📨 Nuevo mensaje recibido:', data);
          observer.next(data);
        });
      }

      // Cleanup cuando se desuscribe
      return () => {
        if (this.socket) {
          this.socket.off('newMessage');
        }
      };
    });
  }

  // ===========================================
  // MÉTODOS DE TYPING (ESCRIBIENDO)
  // ===========================================

  sendTyping(channelId: string, userId: string, username: string): void {
    if (this.socket && channelId) {
      this.socket.emit('typing', { channelId, userId, username });
    }
  }

  sendStopTyping(channelId: string, userId: string): void {
    if (this.socket && channelId) {
      this.socket.emit('stop-typing', { channelId, userId });
    }
  }

  onUserTyping(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('user-typing', (data: any) => {
          observer.next(data);
        });
      }

      return () => {
        if (this.socket) {
          this.socket.off('user-typing');
        }
      };
    });
  }

  onUserStopTyping(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('user-stop-typing', (data: any) => {
          observer.next(data);
        });
      }

      return () => {
        if (this.socket) {
          this.socket.off('user-stop-typing');
        }
      };
    });
  }

  // ===========================================
  // MÉTODOS DE ACTUALIZACIÓN/ELIMINACIÓN
  // ===========================================

  updateMessage(data: any): void {
    if (this.socket) {
      this.socket.emit('update-message', data);
    }
  }

  onMessageUpdated(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('message-updated', (data: any) => {
          observer.next(data);
        });
      }

      return () => {
        if (this.socket) {
          this.socket.off('message-updated');
        }
      };
    });
  }

  deleteMessage(data: any): void {
    if (this.socket) {
      this.socket.emit('delete-message', data);
    }
  }

  onMessageDeleted(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('message-deleted', (data: any) => {
          observer.next(data);
        });
      }

      return () => {
        if (this.socket) {
          this.socket.off('message-deleted');
        }
      };
    });
  }

  // ===========================================
  // MÉTODOS DE REACCIONES
  // ===========================================

  addReaction(data: any): void {
    if (this.socket) {
      this.socket.emit('add-reaction', data);
    }
  }

  onReactionAdded(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('reaction-added', (data: any) => {
          observer.next(data);
        });
      }

      return () => {
        if (this.socket) {
          this.socket.off('reaction-added');
        }
      };
    });
  }

  // ===========================================
  // MÉTODOS DE EVENTOS PERSONALIZADOS
  // ===========================================

  emit(eventName: string, data?: any): void {
    if (this.socket) {
      this.socket.emit(eventName, data);
    }
  }

  on(eventName: string): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on(eventName, (data: any) => {
          observer.next(data);
        });
      }

      return () => {
        if (this.socket) {
          this.socket.off(eventName);
        }
      };
    });
  }

  // ===========================================
  // MÉTODOS DE UTILIDAD
  // ===========================================

  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  removeAllListeners(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}
