import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { Router } from '@angular/router';
import { DiscordService } from '../../services/discord.service';




interface Platform {
  id: string;
  name: string;
  color: string;
}

interface DashboardSubItem {
  id: string;
  label: string;
}

type MenuKey = 'dashboard' | 'conversations' | 'crm' | 'ai' | 'analytics';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {

  // ============ CANALES (igual que antes) ============
  channels: any[] = [];
  currentChannel: any = null;
  loading = true;

  showCreateChannel = false;
  newChannelName = '';

  editingChannel: any = null;
  editedChannelName = '';
  savingChannel = false;

  // ============ MENÚ / SUBMÓDULOS ============
  menuOpened: Record<MenuKey, boolean> = {
    dashboard: false,
    conversations: true,
    crm: false,
    ai: false,
    analytics: false
  };

  dashboardSubItems: DashboardSubItem[] = [
    { id: 'activity', label: 'Actividad' },
    { id: 'traffic', label: 'Tráfico' },
    { id: 'stats', label: 'Estadísticas' }
  ];
  activeDashboardItem = 'stats';

  crmSubItems: DashboardSubItem[] = [
    { id: 'clients', label: 'Clientes' },
    { id: 'funnels', label: 'Embudos' },
    { id: 'deals', label: 'Oportunidades' }
  ];

  analyticsSubItems: DashboardSubItem[] = [
    { id: 'reports', label: 'Reportes' },
    { id: 'performance', label: 'Rendimiento' }
  ];

  // ============ SWITCHER DE PLATAFORMA ============
  platforms: Platform[] = [
    { id: 'whatsapp', name: 'WhatsApp', color: '#25D366' },
    { id: 'slack',    name: 'Slack',    color: '#ECB22E' },
    { id: 'discord',  name: 'Discord',  color: '#5865F2' },
    { id: 'teams',    name: 'Teams',    color: '#6264A7' },
    { id: 'skype',    name: 'Skype',    color: '#00AFF0' },
    { id: 'other',    name: 'Otros',    color: '#9CA3AF' },
  ];

  platformIndex = 0;
  showPlatformDropdown = false;
  isSwitching = false;
  syncingPlatform = false;
  showLinkModal = false;
  discordLinked: boolean | null = null; // null = todavía no se consultó
  

  get selectedPlatform(): Platform {
    return this.platforms[this.platformIndex];
  }

  constructor(
    private chatService: ChatService,
    private router: Router,
    private discordService: DiscordService

  ) {}

  ngOnInit(): void {
    this.loadChannels();

    this.chatService.currentChannel$.subscribe(channel => {
      this.currentChannel = channel;
    });

    this.chatService.refreshChannels$.subscribe(() => {
      this.loadChannels();
    });

    this.checkDiscordStatus();

    // Si venimos de un redirect de OAuth (Discord nos mandó de vuelta a /chat),
    // reabrimos el modal para que el usuario vea sus servidores ya vinculados.
    const params = new URLSearchParams(window.location.search);
    const discordLinkedParam = params.get('discordLinked');
    if (discordLinkedParam) {
      if (discordLinkedParam === 'success') {
        this.showLinkModal = true;
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }


  private checkDiscordStatus(): void {
    this.discordService.getStatus().subscribe({
      next: (response: any) => (this.discordLinked = response.linked),
      error: () => (this.discordLinked = null)
    });
  }

  closeLinkModal(): void {
    this.showLinkModal = false;
    this.checkDiscordStatus();
    this.loadChannels();
  }


  // ============ MENÚ ============
  toggleMenu(menu: MenuKey): void {
    this.menuOpened[menu] = !this.menuOpened[menu];
  }

  selectDashboardItem(id: string): void {
    this.activeDashboardItem = id;
    // TODO: cuando el Dashboard tenga tabs reales, navegar con queryParams:
    // this.router.navigate(['/dashboard'], { queryParams: { view: id } });
  }

  // ============ SWITCHER DE PLATAFORMA ============
  nextPlatform(): void {
    this.platformIndex = (this.platformIndex + 1) % this.platforms.length;
    this.afterPlatformChange();
  }

  prevPlatform(): void {
    this.platformIndex = (this.platformIndex - 1 + this.platforms.length) % this.platforms.length;
    this.afterPlatformChange();
  }

  selectPlatformById(id: string): void {
    const idx = this.platforms.findIndex(p => p.id === id);
    if (idx === -1 || idx === this.platformIndex) {
      this.showPlatformDropdown = false;
      return;
    }
    this.platformIndex = idx;
    this.afterPlatformChange();
  }

  togglePlatformDropdown(): void {
    this.showPlatformDropdown = !this.showPlatformDropdown;
  }

  closePlatformDropdown(): void {
    this.showPlatformDropdown = false;
  }

  // ← NUEVO: trae los canales reales desde Slack/Discord y refresca la lista
  syncCurrentPlatform(): void {
    // Discord ya tiene vinculación real por usuario — abrimos la card en vez
    // del sync directo, que a su vez decide "conectar" o "listar servidores"
    if (this.selectedPlatform.id === 'discord') {
      this.showLinkModal = true;
      return;
    }

    // Las demás plataformas siguen con el sync directo del bot compartido
    // hasta que armemos su OAuth también
    if (this.syncingPlatform) return;
    this.syncingPlatform = true;

    this.chatService.syncPlatformChannels(this.selectedPlatform.id).subscribe({
      next: () => {
        this.syncingPlatform = false;
        this.loadChannels();
      },
      error: (error) => {
        this.syncingPlatform = false;
        const message = error?.error?.message || `No se pudo sincronizar ${this.selectedPlatform.name}.`;
        alert(message);
      }
    });
  }

  private afterPlatformChange(): void {
    this.showPlatformDropdown = false;
    // dispara la clase .switching por un instante para animar
    // la entrada/salida del contenido (ver sidebar.component.scss)
    this.isSwitching = true;
    setTimeout(() => (this.isSwitching = false), 240);
  }

  /**
   * Filtra los canales por la plataforma seleccionada.
   * Si el backend todavía no manda "platform" en ningún canal
   * (retrocompatibilidad con datos viejos), se muestran todos
   * para no dejar la lista vacía.
   */
  get filteredChannels() {
    const hasPlatformField = this.channels.some(c => c.platform);
    if (!hasPlatformField) return this.channels;

    return this.channels.filter(channel =>
      (channel.platform || 'other').toLowerCase() === this.selectedPlatform.id
    );
  }

  countByPlatform(platformId: string): number {
    const hasPlatformField = this.channels.some(c => c.platform);
    if (!hasPlatformField) return this.channels.length;
    return this.channels.filter(c => (c.platform || 'other').toLowerCase() === platformId).length;
  }

  trackByChannelId(_index: number, channel: any) {
    return channel._id;
  }

  // ============ CHAT (sin cambios de lógica) ============
  loadChannels(): void {
    this.loading = true;
    this.chatService.getChannels().subscribe({
      next: (response) => {
        this.channels = response.data || [];
        this.loading = false;

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

  selectChannel(channel: any): void {
    this.chatService.setCurrentChannel(channel);
    if (!this.router.url.includes('/chat')) {
      this.router.navigate(['/chat']);
    }
  }

  createChannel(): void {
    if (!this.newChannelName.trim()) return;

    this.chatService.createChannel({
      name: this.newChannelName.trim(),
      description: '',
      isPrivate: false,
      // ← el canal nuevo queda asociado a la plataforma activa en el switcher
      platform: this.selectedPlatform.id
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

  startEditing(channel: any): void {
    this.editingChannel = channel;
    this.editedChannelName = channel.name;
  }

  updateChannel(): void {
    if (!this.editingChannel || this.savingChannel) return;

    const trimmedName = this.editedChannelName.trim();
    if (!trimmedName) {
      this.editingChannel = null;
      this.editedChannelName = '';
      return;
    }

    this.savingChannel = true;

    this.chatService.updateChannel(this.editingChannel._id, { name: trimmedName }).subscribe({
      next: (response) => {
        this.editingChannel.name = response.data.name;
        this.editingChannel = null;
        this.editedChannelName = '';
        this.savingChannel = false;
      },
      error: (error) => {
        console.error('Error actualizando canal:', error);
        alert(error?.error?.message || 'No fue posible actualizar el canal.');
        this.savingChannel = false;
      }
    });
  }

  deleteChannel(channel: any): void {
    if (!confirm(`¿Abandonar el canal "${channel.name}"?`)) return;

    this.chatService.deleteChannel(channel._id).subscribe({
      next: () => {
        this.channels = this.channels.filter(c => c._id !== channel._id);
        if (this.currentChannel?._id === channel._id) {
          this.currentChannel = null;
        }
      },
      error: (error) => {
        console.error('Error eliminando canal:', error);
        alert(error?.error?.message || 'No fue posible abandonar el canal.');
      }
    });
  }

  get aiChannel() {
    return this.channels.find(c => c.name === 'asistente-ia');
  }

  selectAIChannel(): void {
    if (this.aiChannel) {
      this.selectChannel(this.aiChannel);
    }
  }
}