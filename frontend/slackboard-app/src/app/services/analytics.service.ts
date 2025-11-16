import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private apiUrl = 'http://localhost:3000/api/analytics';

  constructor(private http: HttpClient) {}

  // Obtener estadísticas generales
  getGeneralStats(): Observable<any> {
    return this.http.get(this.apiUrl);
  }

  // Obtener estadísticas por fecha
  getStatsByDate(startDate: string, endDate: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/by-date?startDate=${startDate}&endDate=${endDate}`);
  }

  // Obtener tendencias de mensajes
  getMessageTrends(): Observable<any> {
    return this.http.get(`${this.apiUrl}/trends`);
  }

  // Generar reporte diario
  generateDailyReport(): Observable<any> {
    return this.http.post(`${this.apiUrl}/generate-report`, {});
  }
}
