import { Component, AfterViewInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

declare const google: any;

@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent implements AfterViewInit {
  mode: 'login' | 'register' = 'login';
  email = '';
  username = '';
  password = '';
  loading = false;
  errorMsg: string | null = null;

  constructor(private authService: AuthService, private router: Router) {}

  ngAfterViewInit(): void {
    setTimeout(() => this.renderGoogleButton(), 300);
  }

  private renderGoogleButton(): void {
    if (typeof google === 'undefined') return;

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response: any) => this.handleGoogleCredential(response),
    });

    const container = document.getElementById('googleButtonContainer');
    if (container) {
      google.accounts.id.renderButton(container, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'continue_with',
      });
    }
  }

  private handleGoogleCredential(response: any): void {
    this.loading = true;
    this.errorMsg = null;

    this.authService.loginWithGoogle(response.credential).subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/chat']);
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'No se pudo ingresar con Google.';
      }
    });
  }

  toggleMode(): void {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.errorMsg = null;
  }

  submit(): void {
    if (!this.email.trim() || !this.password.trim() || (this.mode === 'register' && !this.username.trim())) {
      this.errorMsg = 'Completá todos los campos.';
      return;
    }

    this.loading = true;
    this.errorMsg = null;

    const request$ = this.mode === 'login'
      ? this.authService.login(this.email.trim(), this.password)
      : this.authService.register(this.email.trim(), this.username.trim(), this.password);

    request$.subscribe({
      next: () => {
        this.loading = false;
        this.router.navigate(['/chat']);
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Ocurrió un error. Intentá de nuevo.';
      }
    });
  }
}