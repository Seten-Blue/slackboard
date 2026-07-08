import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
  email = '';
  loading = false;
  sent = false;
  errorMsg: string | null = null;

  constructor(private authService: AuthService) {}

  submit(): void {
    if (!this.email.trim()) {
      this.errorMsg = 'Ingresá tu email.';
      return;
    }

    this.loading = true;
    this.errorMsg = null;

    this.authService.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        this.loading = false;
        this.sent = true;
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Ocurrió un error. Intentá de nuevo.';
      }
    });
  }
}