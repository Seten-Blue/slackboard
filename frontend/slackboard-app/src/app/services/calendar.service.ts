import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
  location?: string;
  htmlLink?: string;
}

export interface CalendarResponse {
  events: CalendarEvent[];
  count: number;
}

export interface HolidaysResponse {
  holidays: CalendarEvent[];
  count: number;
}

export interface AuthStatus {
  authenticated: boolean;
  message: string;
}

export interface AuthUrl {
  authUrl: string;
}

export interface CreateEventRequest {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  allDay: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CalendarService {
  private apiUrl = 'http://localhost:3000/api/calendar';

  constructor(private http: HttpClient) {}

  // Verificar estado de autenticación
  getStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>(`${this.apiUrl}/status`);
  }

  // Obtener URL de autorización
  getAuthUrl(): Observable<AuthUrl> {
    return this.http.get<AuthUrl>(`${this.apiUrl}/authorize`);
  }

  // Obtener eventos de hoy
  getTodayEvents(): Observable<CalendarResponse> {
    return this.http.get<CalendarResponse>(`${this.apiUrl}/today`);
  }

  // Obtener eventos de la semana
  getWeekEvents(): Observable<CalendarResponse> {
    return this.http.get<CalendarResponse>(`${this.apiUrl}/week`);
  }

  // Obtener eventos del mes
  getMonthEvents(year: number, month: number): Observable<CalendarResponse> {
    return this.http.get<CalendarResponse>(`${this.apiUrl}/month?year=${year}&month=${month}`);
  }

  // Obtener días festivos
  getHolidays(year: number, country: string = 'es.co'): Observable<HolidaysResponse> {
    return this.http.get<HolidaysResponse>(`${this.apiUrl}/holidays?year=${year}&country=${country}`);
  }

  // Crear evento
  createEvent(event: CreateEventRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/events`, event);
  }

  // Actualizar evento
  updateEvent(eventId: string, event: CreateEventRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/events/${eventId}`, event);
  }

  // Eliminar evento
  deleteEvent(eventId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/events/${eventId}`);
  }

  // Revocar tokens
  revokeAccess(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/revoke`);
  }
}