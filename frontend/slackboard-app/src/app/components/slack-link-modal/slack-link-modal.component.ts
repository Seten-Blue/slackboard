import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { SlackService } from '../../services/slack.service';
import { ChatService } from '../../services/chat.service';

interface SlackWorkspace {
  teamId: string;
  teamName: string;
  connectedAt: string;
}

@Component({
  selector: 'app-slack-link-modal',
  templateUrl: './slack-link-modal.component.html',
  styleUrls: ['./slack-link-modal.component.scss']
})
export class SlackLinkModalComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  workspaces: SlackWorkspace[] = [];
  loadingStatus = true;
  syncingTeamId: string | null = null;
  errorMsg: string | null = null;
  statusMsg: string | null = null;

  constructor(
    private slackService: SlackService,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.checkStatus();
  }

  private checkStatus(): void {
    this.loadingStatus = true;
    this.slackService.getStatus().subscribe({
      next: (response: any) => {
        this.workspaces = response.workspaces || [];
        this.loadingStatus = false;
      },
      error: () => {
        this.loadingStatus = false;
        this.errorMsg = 'No se pudo consultar el estado de la vinculación.';
      }
    });
  }

  connect(): void {
    this.errorMsg = null;
    this.slackService.startOAuth().subscribe({
      next: (response: any) => {
        window.location.href = response.url;
      },
      error: (err: any) => {
        this.errorMsg = err?.error?.message || 'No se pudo iniciar la vinculación con Slack.';
      }
    });
  }

  syncWorkspace(workspace: SlackWorkspace): void {
    this.syncingTeamId = workspace.teamId;
    this.slackService.syncWorkspace(workspace.teamId).subscribe({
      next: () => {
        this.syncingTeamId = null;
        this.chatService.triggerChannelsRefresh();
        this.statusMsg = `Canales de "${workspace.teamName}" sincronizados.`;
      },
      error: (err: any) => {
        this.syncingTeamId = null;
        this.errorMsg = err?.error?.message || `No se pudo sincronizar "${workspace.teamName}".`;
      }
    });
  }

  onClose(): void {
    this.close.emit();
  }
}