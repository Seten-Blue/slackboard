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

  editingChannel: any = null;
  editedChannelName = '';
  savingChannel = false;


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

  startEditing(channel: any) {
  this.editingChannel = channel;
  this.editedChannelName = channel.name;
}

updateChannel() {
  if (!this.editingChannel || this.savingChannel) return;

  const trimmedName = this.editedChannelName.trim();
  if (!trimmedName) {
    this.editingChannel = null;
    this.editedChannelName = '';
    return;
  }

  this.savingChannel = true;

  this.chatService.updateChannel(
    this.editingChannel._id,
    { name: trimmedName }
  ).subscribe({
    next: (response) => {
      this.editingChannel.name = response.data.name;
      this.editingChannel = null;
      this.editedChannelName = '';
      this.savingChannel = false;
    },
    error: (error) => {
      console.error('Error actualizando canal:', error);
      const message = error?.error?.message || 'No fue posible actualizar el canal.';
      alert(message);
      this.savingChannel = false;
    }
  });
}

deleteChannel(channel: any) {

  if (!confirm(`¿Abandonar el canal "${channel.name}"?`)) {
    return;
  }

  this.chatService.deleteChannel(channel._id).subscribe({
    next: () => {

      this.channels = this.channels.filter(c => c._id !== channel._id);

      if (this.currentChannel?._id === channel._id) {
        this.currentChannel = null;
      }

    },

    error: (error) => {
      console.error('Error eliminando canal:', error);
      const message = error?.error?.message || 'No fue posible abandonar el canal.';
      alert(message);
    }

  });

}
}