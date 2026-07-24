import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SurveysService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  createSurvey(data: any): Observable<any> { return this.http.post(`${this.apiUrl}/surveys`, data); }
  getSurveys(params: any = {}): Observable<any> {
    const q = Object.entries(params).filter(([_,v]) => v).map(([k,v]) => `${k}=${v}`).join('&');
    return this.http.get(`${this.apiUrl}/surveys?${q}`);
  }
  getSurvey(id: string): Observable<any> { return this.http.get(`${this.apiUrl}/surveys/${id}`); }
  updateSurvey(id: string, data: any): Observable<any> { return this.http.put(`${this.apiUrl}/surveys/${id}`, data); }
  deleteSurvey(id: string): Observable<any> { return this.http.delete(`${this.apiUrl}/surveys/${id}`); }
  activateSurvey(id: string): Observable<any> { return this.http.post(`${this.apiUrl}/surveys/${id}/activate`, {}); }
  closeSurvey(id: string): Observable<any> { return this.http.post(`${this.apiUrl}/surveys/${id}/close`, {}); }
  submitResponse(id: string, answers: any[]): Observable<any> { return this.http.post(`${this.apiUrl}/surveys/${id}/respond`, { answers }); }
  getResults(id: string): Observable<any> { return this.http.get(`${this.apiUrl}/surveys/${id}/results`); }
  getStats(): Observable<any> { return this.http.get(`${this.apiUrl}/surveys/stats`); }
  getChannels(): Observable<any> { return this.http.get(`${this.apiUrl}/channels`); }
}
