import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ReportsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  createReport(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/reports`, data);
  }

  getReports(page = 1, limit = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}/reports?page=${page}&limit=${limit}`);
  }

  getReport(reportId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/reports/${reportId}`);
  }

  deleteReport(reportId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/reports/${reportId}`);
  }

  signReport(reportId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/reports/${reportId}/sign`, {});
  }

  shareReport(reportId: string, userId: string, permission: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/reports/${reportId}/share`, { userId, permission });
  }

  exportReport(reportId: string, format: string): Observable<any> {
    if (format === 'csv') {
      return this.http.get(`${this.apiUrl}/reports/${reportId}/export?format=csv`, {
        responseType: 'text'
      });
    }
    return this.http.get(`${this.apiUrl}/reports/${reportId}/export?format=json`);
  }

  scheduleReport(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/reports/schedule`, data);
  }

  getScheduledReports(): Observable<any> {
    return this.http.get(`${this.apiUrl}/reports/scheduled`);
  }

  deleteScheduledReport(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/reports/scheduled/${id}`);
  }
}
