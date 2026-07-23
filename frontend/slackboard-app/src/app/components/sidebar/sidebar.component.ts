import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { Router } from '@angular/router';
import { DiscordService } from '../../services/discord.service';
import { SocketService } from '../../services/socket.service';
import { FriendshipService } from '../../services/friendship.service';
import { SlackService } from '../../services/slack.service';
import { WhatsappService } from '../../services/whatsapp.service';
import { AuthService } from '../../services/auth.service';



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
    { id: 'traffic', label: 'Trafico' },
    { id: 'stats', label: 'Estadisticas' }
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
  discordLinked: boolean | null = null; // null = todavia no se consulto

  showSlackModal = false;
  slackLinked: boolean | null = null; // null = todavia no se consulto
  pendingFriendCount = 0;
  

  get selectedPlatform(): Platform {
    return this.platforms[this.platformIndex];
  }

  constructor(
    private chatService: ChatService,
    private router: Router,
    private discordService: DiscordService,
    private slackService: SlackService,
    private whatsappService: WhatsappService,
    public authService: AuthService,
    private socketService: SocketService,
    private friendshipService: FriendshipService
  ) {}

  ngOnInit(): void {
    this.authService.refreshUser().subscribe();

    this.loadChannels();

    this.chatService.currentChannel$.subscribe(channel => {
      this.currentChannel = channel;
    });

    this.chatService.refreshChannels$.subscribe(() => {
      this.loadChannels();
    });

    this.checkDiscordStatus();
    this.checkSlackStatus();
    this.loadPendingFriendCount();

    this.socketService.onFriendshipNewRequest().subscribe(() => this.loadPendingFriendCount());
    this.socketService.onFriendshipUpdate().subscribe(() => this.loadPendingFriendCount());
    this.socketService.onFriendshipRemoved().subscribe(() => this.loadPendingFriendCount());

    // Si venimos de un redirect de OAuth (Discord/Slack nos mandaron de
    // vuelta a /chat), reabrimos el modal correspondiente.
    const params = new URLSearchParams(window.location.search);
    const discordLinkedParam = params.get('discordLinked');
    const slackLinkedParam = params.get('slackLinked');

    if (discordLinkedParam && discordLinkedParam === 'success') {
      this.showLinkModal = true;
    }

    if (slackLinkedParam && slackLinkedParam === 'success') {
      this.showSlackModal = true;
    }

    if (discordLinkedParam || slackLinkedParam) {
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

  private checkSlackStatus(): void {
    this.slackService.getStatus().subscribe({
      next: (response: any) => (this.slackLinked = (response.workspaces || []).length > 0),
      error: () => (this.slackLinked = null)
    });
  }

  closeSlackModal(): void {
    this.showSlackModal = false;
    this.checkSlackStatus();
    this.loadChannels();
  }


  // ============ MENÚ ============
  toggleMenu(menu: MenuKey): void {
    this.menuOpened[menu] = !this.menuOpened[menu];
  }

  loadPendingFriendCount() {
    this.friendshipService.listPending().subscribe({
      next: (res) => { this.pendingFriendCount = (res.data?.received || []).length; },
      error: () => {}
    });
  }

  selectDashboardItem(id: string): void {
    this.activeDashboardItem = id;
    this.router.navigate(['/dashboard'], { queryParams: { view: id } });
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
    // Discord ya tiene vinculacion real por usuario — abrimos la card en vez
    // del sync directo, que a su vez decide "conectar" o "listar servidores"
    if (this.selectedPlatform.id === 'discord') {
      this.showLinkModal = true;
      return;
    }

    if (this.selectedPlatform.id === 'slack') {
      this.showSlackModal = true;
      return;
    }

    if (this.selectedPlatform.id === 'whatsapp') {
      this.whatsappService.joinInbox().subscribe({
        next: () => this.loadChannels(),
        error: (error: any) => alert(error?.error?.message || 'No se pudo conectar el inbox de WhatsApp.')
      });
      return;
    }

    // Las demas plataformas siguen con el sync directo del bot compartido
    // hasta que armemos su OAuth tambien
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
   * Si el backend todavia no manda "platform" en ningun canal
   * (retrocompatibilidad con datos viejos), se muestran todos
   * para no dejar la lista vacia.
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

  // ============ CHAT (sin cambios de logica) ============
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
      platform: this.selectedPlatform.id
    }).subscribe({
      next: (response) => {
        this.channels.push(response.data);
        this.newChannelName = '';
        this.showCreateChannel = false;
        this.selectChannel(response.data);
        if (response.warning) {
          alert(response.warning);
        }
      },
      error: (error) => {
        console.error('Error creando canal:', error);
        alert(error?.error?.message || 'Error al crear el canal');
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
    if (!confirm(`?Abandonar el canal "${channel.name}"?`)) return;

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
    return this.channels.find(c => c.isAIChannel === true || c.name === 'asistente-ia');
  }

  selectAIChannel(): void {
    if (this.aiChannel) {
      this.selectChannel(this.aiChannel);
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}