import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PerformanceService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getSnapshot(): Observable<any> {
    return this.http.get(`${this.apiUrl}/performance/snapshot`);
  }

  getHistory(hours = 24): Observable<any> {
    return this.http.get(`${this.apiUrl}/performance/history?hours=${hours}`);
  }

  getTrends(): Observable<any> {
    return this.http.get(`${this.apiUrl}/performance/trends`);
  }

  getAlerts(): Observable<any> {
    return this.http.get(`${this.apiUrl}/performance/alerts`);
  }

  getIntegrationStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/performance/integrations`);
  }
}
