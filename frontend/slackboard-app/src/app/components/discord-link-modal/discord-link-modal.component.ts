import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { DiscordService } from '../../services/discord.service';
import { ChatService } from '../../services/chat.service';

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
  inviteUrl: string;
}

@Component({
  selector: 'app-discord-link-modal',
  templateUrl: './discord-link-modal.component.html',
  styleUrls: ['./discord-link-modal.component.scss']
})
export class DiscordLinkModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  linked = false;
  discordUsername: string | null = null;
  loadingStatus = true;
  loadingGuilds = false;
  guilds: DiscordGuild[] = [];
  syncingGuildId: string | null = null;
  errorMsg: string | null = null;
  statusMsg: string | null = null;

  constructor(
    private discordService: DiscordService,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.checkStatus();
  }

  private checkStatus(): void {
    this.loadingStatus = true;
    this.discordService.getStatus().subscribe({
      next: (response: any) => {
        this.linked = response.linked;
        this.discordUsername = response.discordUsername;
        this.loadingStatus = false;
        if (this.linked) this.loadGuilds();
      },
      error: () => {
        this.loadingStatus = false;
        this.errorMsg = 'No se pudo consultar el estado de la vinculación.';
      }
    });
  }

  connect(): void {
    this.errorMsg = null;
    this.discordService.startOAuth().subscribe({
      next: (response: any) => {
        window.location.href = response.url;
      },
      error: (err: any) => {
        this.errorMsg = err?.error?.message || 'No se pudo iniciar la vinculación con Discord.';
      }
    });
  }

  loadGuilds(): void {
    this.loadingGuilds = true;
    this.discordService.getMyGuilds().subscribe({
      next: (response: any) => {
        this.guilds = response.data || [];
        this.loadingGuilds = false;
      },
      error: (err: any) => {
        this.loadingGuilds = false;
        this.errorMsg = err?.error?.message || 'No se pudieron cargar tus servidores de Discord.';
      }
    });
  }

  inviteBot(guild: DiscordGuild): void {
    window.open(guild.inviteUrl, '_blank');
  }

  syncGuild(guild: DiscordGuild): void {
    this.syncingGuildId = guild.id;
    this.discordService.syncGuild(guild.id).subscribe({
      next: () => {
        this.syncingGuildId = null;
        this.chatService.triggerChannelsRefresh();
        this.statusMsg = `Canales de "${guild.name}" sincronizados.`;
      },
      error: (err: any) => {
        this.syncingGuildId = null;
        this.errorMsg = err?.error?.message || `No se pudo sincronizar "${guild.name}".`;
      }
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
