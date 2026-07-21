import { Component, OnInit } from '@angular/core';
import { AuthService, AuthUser } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile-settings',
  templateUrl: './profile-settings.component.html',
  styleUrls: ['./profile-settings.component.scss']
})
export class ProfileSettingsComponent implements OnInit {
  user: AuthUser | null = null;
  username = '';
  avatar = '';
  nombre = '';
  apellido = '';
  telefono = '';
  idioma = '';
  loading = false;
  successMsg: string | null = null;
  errorMsg: string | null = null;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.authService.refreshUser().subscribe({
      next: () => {
        this.user = this.authService.currentUser;
        this.loadUserData();
      },
      error: () => {
        this.user = this.authService.currentUser;
        this.loadUserData();
      }
    });
  }

  private loadUserData(): void {
    if (this.user) {
      this.username = this.user.username || '';
      this.avatar = this.user.avatar || '';
      this.nombre = this.user.nombre || '';
      this.apellido = this.user.apellido || '';
      this.telefono = this.user.telefono || '';
      this.idioma = this.user.idioma || '';
    }
  }

  save(): void {
    this.errorMsg = null;
    this.successMsg = null;

    if (!this.username.trim()) {
      this.errorMsg = 'El nombre de usuario es requerido';
      return;
    }

    if (this.username.trim().length < 2 || this.username.trim().length > 30) {
      this.errorMsg = 'El nombre de usuario debe tener entre 2 y 30 caracteres';
      return;
    }

    this.loading = true;

    this.authService.updateProfile({
      username: this.username.trim(),
      avatar: this.avatar.trim() || undefined,
      nombre: this.nombre.trim() || undefined,
      apellido: this.apellido.trim() || undefined,
      telefono: this.telefono.trim() || undefined,
      idioma: this.idioma.trim() || undefined,
    }).subscribe({
      next: (response) => {
        this.loading = false;
        this.successMsg = 'Perfil actualizado correctamente';
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMsg = err?.error?.message || 'Error al actualizar el perfil';
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/chat']);
  }
}
