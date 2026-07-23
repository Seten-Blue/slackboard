import { Component, OnInit } from '@angular/core';
import { AuthService, AuthUser } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
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
  bio = '';
  ubicacion = '';
  intereses: string[] = [];
  newInteres = '';
  github = '';
  linkedin = '';
  website = '';
  loading = false;
  successMsg: string | null = null;
  errorMsg: string | null = null;
  uploadingPhoto = false;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router
  ) {}

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
      this.bio = this.user.bio || '';
      this.ubicacion = this.user.ubicacion || '';
      this.intereses = this.user.intereses ? [...this.user.intereses] : [];
      this.github = this.user.github || '';
      this.linkedin = this.user.linkedin || '';
      this.website = this.user.website || '';
    }
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.errorMsg = 'La imagen no puede superar 5 MB';
      return;
    }

    this.uploadingPhoto = true;
    this.errorMsg = null;
    this.chatService.uploadAttachment(file).subscribe({
      next: (response) => {
        this.avatar = response.url;
        this.uploadingPhoto = false;
      },
      error: () => {
        this.errorMsg = 'Error al subir la imagen';
        this.uploadingPhoto = false;
      }
    });
  }

  addInteres(): void {
    const val = this.newInteres.trim();
    if (val && !this.intereses.includes(val) && this.intereses.length < 10) {
      this.intereses.push(val);
      this.newInteres = '';
    }
  }

  removeInteres(interes: string): void {
    this.intereses = this.intereses.filter(i => i !== interes);
  }

  onInteresKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addInteres();
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
      avatar: this.avatar.trim() || '',
      nombre: this.nombre.trim() || '',
      apellido: this.apellido.trim() || '',
      telefono: this.telefono.trim() || '',
      idioma: this.idioma.trim() || '',
      bio: this.bio.trim() || '',
      ubicacion: this.ubicacion.trim() || '',
      intereses: this.intereses,
      github: this.github.trim() || '',
      linkedin: this.linkedin.trim() || '',
      website: this.website.trim() || '',
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
