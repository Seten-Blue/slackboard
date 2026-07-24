import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  createTask(data: any): Observable<any> { return this.http.post(`${this.apiUrl}/tasks`, data); }
  getTasks(params: any = {}): Observable<any> {
    const q = Object.entries(params).filter(([_,v]) => v).map(([k,v]) => `${k}=${v}`).join('&');
    return this.http.get(`${this.apiUrl}/tasks?${q}`);
  }
  getTask(id: string): Observable<any> { return this.http.get(`${this.apiUrl}/tasks/${id}`); }
  updateTask(id: string, data: any): Observable<any> { return this.http.put(`${this.apiUrl}/tasks/${id}`, data); }
  deleteTask(id: string): Observable<any> { return this.http.delete(`${this.apiUrl}/tasks/${id}`); }
  assignTask(id: string, assigneeId: string): Observable<any> { return this.http.post(`${this.apiUrl}/tasks/${id}/assign`, { assigneeId }); }
  updateStatus(id: string, status: string): Observable<any> { return this.http.post(`${this.apiUrl}/tasks/${id}/status`, { status }); }
  addTimeEntry(id: string, data: any): Observable<any> { return this.http.post(`${this.apiUrl}/tasks/${id}/time`, data); }
  addComment(id: string, text: string): Observable<any> { return this.http.post(`${this.apiUrl}/tasks/${id}/comment`, { text }); }
  addSubtask(id: string, title: string): Observable<any> { return this.http.post(`${this.apiUrl}/tasks/${id}/subtask`, { title }); }
  toggleSubtask(id: string, index: number): Observable<any> { return this.http.post(`${this.apiUrl}/tasks/${id}/subtask/${index}/toggle`, {}); }
  getStats(): Observable<any> { return this.http.get(`${this.apiUrl}/tasks/stats`); }
  getReport(params: any = {}): Observable<any> {
    const q = Object.entries(params).filter(([_,v]) => v).map(([k,v]) => `${k}=${v}`).join('&');
    return this.http.get(`${this.apiUrl}/tasks/report?${q}`);
  }
}
