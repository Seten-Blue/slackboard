import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
  email = '';
  token = '';
  newPassword = '';
  confirmPassword = '';
  loading = false;
  success = false;
  errorMsg: string | null = null;
  tokenMissing = false;

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || '';
      this.email = params['email'] || '';
      this.tokenMissing = !this.token || !this.email;
    });
  }

  submit(): void {
    if (!this.newPassword.trim() || this.newPassword.length < 6) {
      this.errorMsg = 'La contrasena debe tener al menos 6 caracteres.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMsg = 'Las contrasenas no coinciden.';
      return;
    }

    this.loading = true;
    this.errorMsg = null;

    this.authService.resetPassword(this.email, this.token, this.newPassword).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        setTimeout(() => this.router.navigate(['/login']), 2500);
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Ocurrio un error. Intenta de nuevo.';
      }
    });
  }
}