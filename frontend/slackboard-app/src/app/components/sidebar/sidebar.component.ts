import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';
import { Router } from '@angular/router';
import { DiscordService } from '../../services/discord.service';
import { SocketService } from '../../services/socket.service';
import { FriendshipService } from '../../services/friendship.service';
import { SlackService } from '../../services/slack.service';
import { WhatsappService } from '../../services/whatsapp.service';
import { AuthService } from '../../services/auth.service';
import { SoundService } from '../../services/sound.service';
import { TrelloNotificationsService } from '../../services/trello-notifications.service';



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

  confirmDeleteId: string | null = null;

  // Avisos no bloqueantes (reemplazan a alert/confirm nativos que congelan el hilo)
  uiAlerts: { id: number; kind: 'error' | 'warning' | 'success'; text: string }[] = [];

  // ============ MENÚ / SUBMÓDULOS ============
  menuOpened: Record<MenuKey, boolean> = {
    dashboard: false,
    conversations: true,
    crm: false,
    ai: false,
    analytics: false
  };

  dashboardSubItems: DashboardSubItem[] = [
    { id: 'activity', label: 'Resumen del Dia' },
    { id: 'traffic', label: 'Trafico' },
    { id: 'stats', label: 'Estadisticas' },
    { id: 'tasks', label: 'Tareas' },
    { id: 'surveys', label: 'Encuestas' }
  ];
  activeDashboardItem = 'stats';
  activeAnalyticsItem = '';

  crmSubItems: DashboardSubItem[] = [
    { id: 'clients', label: 'Clientes' },
    { id: 'funnels', label: 'Embudos' },
    { id: 'deals', label: 'Oportunidades' }
  ];

  analyticsSubItems: DashboardSubItem[] = [
    { id: 'reports', label: 'Reportes' },
    { id: 'audit', label: 'Auditoria' },
    { id: 'performance', label: 'Rendimiento' },
    { id: 'ai-metrics', label: 'Metricas IA' }
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
  slackWorkspaces: any[] = []; // workspaces vinculados (teamId -> teamName)
  pendingFriendCount = 0;
  trelloToasts: any[] = [];
  trelloUnread = 0;
  messageToasts: any[] = [];
  

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
    private friendshipService: FriendshipService,
    private soundService: SoundService,
    private trelloNotifs: TrelloNotificationsService
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

    // Mantener vivo el contador de mensajes por canal + alertas de mensajes nuevos
    this.socketService.onNewMessage().subscribe((data: any) => {
      this.bumpChannelCount(data?.channelId);
      this.onChannelMessage(data);
    });
    this.socketService.onThreadReply().subscribe((data: any) => {
      const threadChannelId = data?.reply?.channel || data?.parentMessageId;
      this.bumpChannelCount(threadChannelId);
      if (threadChannelId && threadChannelId !== this.currentChannel?._id) {
        this.soundService.play('threadReply');
      }
    });

    this.socketService.onTrelloNotification().subscribe((data: any) => {
      this.addTrelloToast(data);
      this.soundService.play('trello');
      this.trelloNotifs.push(data);
    });

    this.socketService.onChannelDeleted().subscribe(() => {
      this.loadChannels();
      this.chatService.setCurrentChannel(null);
    });

    this.socketService.onChannelRenamed().subscribe(() => {
      this.loadChannels();
    });

    this.trelloNotifs.count$.subscribe((count) => {
      this.trelloUnread = count;
    });

    // Si venimos de un redirect de OAuth (Discord/Slack nos mandaron de
    // vuelta a /chat), reabrimos el modal correspondiente.
    const params = new URLSearchParams(window.location.search);
    const discordLinkedParam = params.get('discordLinked');
    const slackLinkedParam = params.get('slackLinked');
    const trelloLinkedParam = params.get('trelloLinked');

    if (discordLinkedParam && discordLinkedParam === 'success') {
      this.showLinkModal = true;
    }

    if (slackLinkedParam && slackLinkedParam === 'success') {
      this.showSlackModal = true;
    }

    if (trelloLinkedParam && trelloLinkedParam === 'success') {
      // Trello linked — Trello component will re-check status automatically
    }

    if (discordLinkedParam || slackLinkedParam || trelloLinkedParam) {
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
      next: (response: any) => {
        this.slackWorkspaces = response.workspaces || [];
        this.slackLinked = this.slackWorkspaces.length > 0;
      },
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

  selectAnalyticsItem(id: string): void {
    this.activeAnalyticsItem = id;
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
        error: (error: any) => this.pushAlert('error', error?.error?.message || 'No se pudo conectar el inbox de WhatsApp.')
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
        this.pushAlert('error', message);
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
   * Canales visibles para la plataforma seleccionada, excluyendo los canales
   * internos de la IA (Zork) que nada tienen que ver con Slack/Discord.
   */
  get platformChannels(): any[] {
    return this.channels.filter((c: any) => !c.isAIChannel && (c.platform || 'other').toLowerCase() === this.selectedPlatform.id);
  }

  get filteredChannels() {
    const real = this.channels.filter((c: any) => !c.isAIChannel);
    const hasPlatformField = real.some(c => c.platform);
    if (!hasPlatformField) return real;

    return real.filter(channel =>
      (channel.platform || 'other').toLowerCase() === this.selectedPlatform.id
    );
  }

  /** Fermilla de datos que determinan los grupos; si no cambia, se reutiliza la misma referencia. */
  private _groupsCacheKey = '';
  private _groupsCache: { name: string; channels: any[] }[] = [];

  /**
   * Agrupa los canales de la plataforma por SITIO/SERVIDOR real:
   * - Discord: por servidor (discordGuildName)
   * - Slack: por workspace (slackTeamId -> nombre del workspace vinculado)
   * Asi un "# general" de un servidor ya no se confunde con el de otro.
   *
   * IMPORTANTE: esta "getter" esta memoizada. Como mudos de los canales pueden
   * apuntar a la misma referencia de arrays (this.channels, slackWorkspaces),
   * se calcula un hash solo con los campos que afectan el agrupado y se reutiliza
   * el array de grupos si no hubo cambios. De no hacerlo, ngFor + [(ngModel)]
   * recrearian las views en cada ciclo de deteccion de cambios, provocando un
   * bucle infinito de change detection (la app se congela).
   */
  get channelGroups(): { name: string; channels: any[] }[] {
    const platform = this.selectedPlatform.id;
    const key = this._groupsKey(platform);
    if (key === this._groupsCacheKey) {
      return this._groupsCache;
    }

    const list = this.filteredChannels;
    const groups: { name: string; channels: any[] }[] = [];
    const map = new Map<string, any[]>();

    for (const ch of list) {
      let groupName: string;
      if (platform === 'discord') {
        groupName = ch.discordGuildName || 'Discord';
      } else if (platform === 'slack') {
        const ws = this.slackWorkspaces.find((w: any) => w.teamId === ch.slackTeamId);
        groupName = ws?.teamName || 'Slack';
      } else {
        groupName = this.selectedPlatform.name;
      }
      if (!map.has(groupName)) {
        map.set(groupName, []);
        groups.push({ name: groupName, channels: map.get(groupName)! });
      }
      map.get(groupName)!.push(ch);
    }

    this._groupsCacheKey = key;
    this._groupsCache = groups;
    return groups;
  }

  /** Clave estable con los datos que afectan el agrupado por sitio/servidor. */
  private _groupsKey(platform: string): string {
    const parts = [platform];
    for (const ch of this.channels) {
      if (ch.isAIChannel) continue;
      parts.push(
        ch._id,
        ch.platform || 'other',
        ch.discordGuildName || '',
        ch.slackTeamId || '',
        ch.name || ''
      );
    }
    for (const w of this.slackWorkspaces) {
      parts.push('ws', w.teamId, w.teamName || '');
    }
    return parts.join('|');
  }

  countByPlatform(platformId: string): number {
    const real = this.channels.filter((c: any) => !c.isAIChannel);
    const hasPlatformField = real.some(c => c.platform);
    if (!hasPlatformField) return real.length;
    return real.filter(c => (c.platform || 'other').toLowerCase() === platformId).length;
  }

  trackByChannelId(_index: number, channel: any) {
    return channel._id;
  }

  trackByGroupName(_index: number, group: any) {
    return group.name;
  }

  /** Incrementa el contador de NO LEIDOS del canal (si no es el canal abierto). */
  bumpChannelCount(channelId: string): void {
    if (!channelId) return;
    if (channelId === this.currentChannel?._id) return;
    const target = this.channels.find((c: any) => c._id === channelId);
    if (target) {
      target.unreadCount = (target.unreadCount || 0) + 1;
    }
  }

  /** Notificación con sonido para mensajes que llegan a un canal que no está abierto. */
  onChannelMessage(data: any): void {
    const channelId = data?.channelId;
    if (!channelId) return;
    // No distraer con el canal abierto (ya lo renderiza message-area)
    if (channelId === this.currentChannel?._id) return;
    // Ignorar los propios mensajes (ej. otro tab/ventana)
    const senderId = data?.message?.sender?._id || data?.message?.userId;
    if (senderId && this.authService.currentUser?._id && senderId === this.authService.currentUser._id) return;

    this.soundService.play('message');

    const target = this.channels.find((c: any) => c._id === channelId);
    const channelName = target?.displayName || target?.name || 'canal';
    const senderName = data?.message?.sender?.username || 'Alguien';
    const content =
      data?.message?.content && typeof data.message.content === 'string'
        ? (data.message.content.length > 80 ? data.message.content.slice(0, 80) + '…' : data.message.content)
        : '';

    const toastId = Date.now() + Math.random();
    this.messageToasts.push({
      id: toastId,
      channelId,
      channelName,
      senderName,
      content,
    });
    if (this.messageToasts.length > 4) this.messageToasts.shift();
    setTimeout(() => {
      this.messageToasts = this.messageToasts.filter((t: any) => t.id !== toastId);
    }, 8000);
  }

  // ============ CHAT (sin cambios de logica) ============
  loadChannels(): void {
    this.loading = true;
    this.chatService.getChannels().subscribe({
      next: (response) => {
        this.channels = response.data || [];
        this.loading = false;

        // Unirse a la sala de TODOS los canales para mantener vivos
        // los contadores y sonidos de mensajes entrantes sin abrir el canal.
        (this.channels || []).forEach((ch: any) => {
          if (ch?._id) this.socketService.joinChannel(ch._id);
        });

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
    if (!channel) return;
    // Marca como leido en el servidor y en la UI (vacía el badge de no leídos)
    if (channel._id && this.chatService) {
      this.chatService.markChannelRead(channel._id).subscribe({
        next: () => {
          const target = this.channels.find((c: any) => c._id === channel._id);
          if (target) target.unreadCount = 0;
        },
        error: (err: any) => console.warn('No se pudo marcar el canal como leido:', err),
      });
    }
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
          this.pushAlert('warning', response.warning);
        }
      },
      error: (error) => {
        console.error('Error creando canal:', error);
        this.pushAlert('error', error?.error?.message || 'Error al crear el canal');
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
        if (response.warning) {
          this.pushAlert('warning', response.warning);
        }
      },
      error: (error) => {
        console.error('Error actualizando canal:', error);
        this.pushAlert('error', error?.error?.message || 'No fue posible actualizar el canal.');
        this.savingChannel = false;
      }
    });
  }

  askDeleteChannel(channel: any): void {
    this.confirmDeleteId = channel._id;
  }

  cancelDeleteChannel(): void {
    this.confirmDeleteId = null;
  }

  deleteChannel(channel: any): void {
    this.confirmDeleteId = null;

    this.chatService.deleteChannel(channel._id).subscribe({
      next: () => {
        this.channels = this.channels.filter(c => c._id !== channel._id);
        if (this.currentChannel?._id === channel._id) {
          this.currentChannel = null;
        }
      },
      error: (error) => {
        console.error('Error eliminando canal:', error);
        this.pushAlert('error', error?.error?.message || 'No fue posible abandonar el canal.');
      }
    });
  }

  pushAlert(kind: 'error' | 'warning' | 'success', text: string): void {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    this.uiAlerts.push({ id, kind, text });
    setTimeout(() => {
      this.uiAlerts = this.uiAlerts.filter(a => a.id !== id);
    }, 6000);
  }

  dismissAlert(id: number): void {
    this.uiAlerts = this.uiAlerts.filter(a => a.id !== id);
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

  addTrelloToast(data: any): void {
    const actionId = data?.actionId || '';
    const ts = data?.ts || '';
    const alreadyShown = this.trelloToasts.some(
      (t) => (actionId && t.actionId === actionId) || (!actionId && t.cardUrl === data?.cardUrl && t.ts === ts),
    );
    if (alreadyShown) return;
    const toast = {
      id: Date.now() + Math.random(),
      actionId: actionId || `${data?.cardUrl || ''}|${ts}`,
      title: data?.title || 'Cambio en el tablero de Trello',
      detail: data?.detail || '',
      boardName: data?.boardName || '',
      cardUrl: data?.cardUrl || '',
      ts,
    };
    this.trelloToasts.push(toast);
    if (this.trelloToasts.length > 4) this.trelloToasts.shift();
    setTimeout(() => this.removeTrelloToast(toast.id), 20000);
  }

  removeTrelloToast(id: number): void {
    this.trelloToasts = this.trelloToasts.filter(t => t.id !== id);
  }

  dismissTrelloToasts(): void {
    this.trelloToasts = [];
  }

  selectChannelToast(toast: any): void {
    if (!toast?.channelId) return;
    const target = this.channels.find((c: any) => c._id === toast.channelId);
    if (target) this.selectChannel(target);
  }

  dismissMessageToasts(): void {
    this.messageToasts = [];
  }

  openTrelloToast(toast: any): void {
    if (toast.cardUrl) {
      window.open(toast.cardUrl, '_blank');
    }
    this.removeTrelloToast(toast.id);
  }
}