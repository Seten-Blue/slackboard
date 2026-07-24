import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  getLogs(params: any = {}): Observable<any> {
    const q = Object.entries(params).filter(([_, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return this.http.get(`${this.apiUrl}/audit?${q}`);
  }
  getLog(id: string): Observable<any> { return this.http.get(`${this.apiUrl}/audit/${id}`); }
  getStats(): Observable<any> { return this.http.get(`${this.apiUrl}/audit/stats`); }
  getRecent(limit = 20): Observable<any> { return this.http.get(`${this.apiUrl}/audit/recent?limit=${limit}`); }
  search(query: string): Observable<any> { return this.http.get(`${this.apiUrl}/audit/search?q=${encodeURIComponent(query)}`); }
  getUserActivity(userId: string): Observable<any> { return this.http.get(`${this.apiUrl}/audit/user/${userId}`); }
}
