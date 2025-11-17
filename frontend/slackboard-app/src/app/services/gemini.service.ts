import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatResponse {
  success: boolean;
  data: {
    message: string;
  };
}

export interface AnalysisResponse {
  success: boolean;
  data: {
    sentiment: string;
    topics: string[];
    summary: string;
  };
}

export interface SummaryResponse {
  success: boolean;
  data: {
    summary: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  private apiUrl = `${environment.apiUrl}/gemini`;

  constructor(private http: HttpClient) {}

  getStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/status`);
  }

  chat(userId: string, message: string, channelId?: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/chat`, {
      userId,
      message,
      channelId
    });
  }

  summarizeText(text: string): Observable<SummaryResponse> {
    return this.http.post<SummaryResponse>(`${this.apiUrl}/summarize`, { text });
  }

  analyzeMessage(message: string): Observable<AnalysisResponse> {
    return this.http.post<AnalysisResponse>(`${this.apiUrl}/analyze`, { message });
  }

  generateChannelSummary(channelId: string, limit: number = 50): Observable<SummaryResponse> {
    return this.http.post<SummaryResponse>(`${this.apiUrl}/channel-summary`, {
      channelId,
      limit
    });
  }

  clearHistory(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/history/${userId}`);
  }
}