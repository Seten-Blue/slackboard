import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = 'http://localhost:3000/api';
  
  // Estado actual del canal seleccionado
  private currentChannelSubject = new BehaviorSubject<any>(null);
  public currentChannel$ = this.currentChannelSubject.asObservable();

  // Usuario simulado (en producción vendría de auth)
  private currentUser = {
    _id: '674f8a1234567890abcdef01',
    username: 'Admin',
    email: 'admin@slackboard.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'
  };

  constructor(private http: HttpClient) {}

  // Obtener todos los canales
  getChannels(): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels`);
  }

  // Obtener un canal por ID
  getChannelById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/channels/${id}`);
  }

  // Crear un nuevo canal
  createChannel(channelData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/channels`, {
      ...channelData,
      createdBy: this.currentUser._id
    });
  }

  // Obtener mensajes de un canal
  getMessagesByChannel(channelId: string, limit = 50, skip = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/messages/channel/${channelId}?limit=${limit}&skip=${skip}`);
  }

  // Enviar un mensaje
  sendMessage(messageData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages`, {
      ...messageData,
      sender: this.currentUser._id
    });
  }

  // Actualizar mensaje
  updateMessage(messageId: string, content: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/messages/${messageId}`, { content });
  }

  // Eliminar mensaje
  deleteMessage(messageId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`);
  }

  // Agregar reacción
  addReaction(messageId: string, emoji: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/messages/${messageId}/reaction`, {
      emoji,
      userId: this.currentUser._id
    });
  }

  // Establecer canal actual
  setCurrentChannel(channel: any): void {
    this.currentChannelSubject.next(channel);
  }

  // Obtener usuario actual
  getCurrentUser(): any {
    return this.currentUser;
  }
}
