import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  channels: any[] = [];
  currentChannel: any = null;
  loading = true;
  showCreateChannel = false;
  newChannelName = '';

  constructor(
    private chatService: ChatService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadChannels();
    
    // Suscribirse al canal actual
    this.chatService.currentChannel$.subscribe(channel => {
      this.currentChannel = channel;
    });
  }

  loadChannels() {
    this.loading = true;
    this.chatService.getChannels().subscribe({
      next: (response) => {
        this.channels = response.data || [];
        this.loading = false;
        
        // Seleccionar el primer canal por defecto
        if (this.channels.length > 0 && !this.currentChannel) {
          this.selectChannel(this.channels[0]);
        }
      },
      error: (error) => {
        console.error('Error cargando canales:', error);
        this.loading = false;
      }
    });
  }

  selectChannel(channel: any) {
    this.chatService.setCurrentChannel(channel);
    // Navegar a chat si no estamos ahí
    if (!this.router.url.includes('/chat')) {
      this.router.navigate(['/chat']);
    }
  }

  createChannel() {
    if (!this.newChannelName.trim()) return;

    this.chatService.createChannel({
      name: this.newChannelName.trim(),
      description: '',
      isPrivate: false
    }).subscribe({
      next: (response) => {
        this.channels.push(response.data);
        this.newChannelName = '';
        this.showCreateChannel = false;
        this.selectChannel(response.data);
      },
      error: (error) => {
        console.error('Error creando canal:', error);
        alert('Error al crear el canal');
      }
    });
  }
}