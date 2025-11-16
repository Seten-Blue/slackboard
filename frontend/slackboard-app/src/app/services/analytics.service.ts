import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getGeneralStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/analytics`);
  }

  getStatsByDate(startDate: string, endDate: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/analytics/by-date`, {
      params: { startDate, endDate }
    });
  }

  getMessageTrends(): Observable<any> {
    return this.http.get(`${this.apiUrl}/analytics/trends`);
  }

  generateDailyReport(): Observable<any> {
    return this.http.post(`${this.apiUrl}/analytics/generate-report`, {});
  }
}
