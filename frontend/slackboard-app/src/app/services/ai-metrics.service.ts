import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AiMetricsService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  getMetrics(params: any = {}): Observable<any> {
    const q = Object.entries(params).filter(([_, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return this.http.get(`${this.apiUrl}/ai-metrics?${q}`);
  }
  getStats(): Observable<any> { return this.http.get(`${this.apiUrl}/ai-metrics/stats`); }
  getDepartments(): Observable<any> { return this.http.get(`${this.apiUrl}/ai-metrics/departments`); }
  getCosts(): Observable<any> { return this.http.get(`${this.apiUrl}/ai-metrics/costs`); }
  getPerformance(): Observable<any> { return this.http.get(`${this.apiUrl}/ai-metrics/performance`); }
  getModels(): Observable<any> { return this.http.get(`${this.apiUrl}/ai-metrics/models`); }
}
