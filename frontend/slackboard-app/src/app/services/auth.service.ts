import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthUser {
  _id: string;
  email: string;
  username: string;
  avatar?: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
  idioma?: string;
  bio?: string;
  ubicacion?: string;
  intereses?: string[];
  github?: string;
  linkedin?: string;
  website?: string;
}

interface AuthResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  message?: string;
}

interface ProfileUpdateResponse {
  success: boolean;
  message: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private readonly TOKEN_KEY = 'slackboard_token';
  private readonly USER_KEY = 'slackboard_user';

  private currentUserSubject = new BehaviorSubject<AuthUser | null>(this.getStoredUser());
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {}

  get token(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.token;
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, { email, password }).pipe(
      tap(response => this.setSession(response))
    );
  }

  register(
    email: string,
    username: string,
    password: string,
    nombre?: string,
    apellido?: string,
    telefono?: string,
    idioma?: string
  ): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, {
      email,
      username,
      password,
      nombre,
      apellido,
      telefono,
      idioma,
    }).pipe(
      tap(response => this.setSession(response))
    );
  }

  loginWithGoogle(idToken: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/google`, { idToken }).pipe(
      tap(response => this.setSession(response))
    );
  }

  updateProfile(data: {
    username: string;
    avatar?: string;
    nombre?: string;
    apellido?: string;
    telefono?: string;
    idioma?: string;
    bio?: string;
    ubicacion?: string;
    intereses?: string[];
    github?: string;
    linkedin?: string;
    website?: string;
  }): Observable<ProfileUpdateResponse> {
    return this.http.put<ProfileUpdateResponse>(`${this.apiUrl}/auth/profile`, data).pipe(
      tap(response => {
        if (response.success && response.user) {
          localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
        }
      })
    );
  }

  refreshUser(): Observable<any> {
    return this.http.get<{ success: boolean; data: AuthUser }>(`${this.apiUrl}/auth/me`).pipe(
      tap(response => {
        if (response.success && response.data) {
          localStorage.setItem(this.USER_KEY, JSON.stringify(response.data));
          this.currentUserSubject.next(response.data);
        }
      })
    );
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(email: string, token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/auth/reset-password`, { email, token, newPassword });
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.currentUserSubject.next(null);
  }

  linkTrello(trelloApiKey: string, trelloToken: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/auth/trello`, { trelloApiKey, trelloToken });
  }

  unlinkTrello(): Observable<any> {
    return this.http.delete(`${this.apiUrl}/auth/trello`);
  }

  getTrelloStatus(): Observable<any> {
    return this.http.get(`${this.apiUrl}/auth/trello/status`);
  }

  private setSession(response: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, response.token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
    this.currentUserSubject.next(response.user);
  }

  private getStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}