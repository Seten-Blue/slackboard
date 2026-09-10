import { Component, OnInit, OnDestroy } from '@angular/core';
import { FriendshipService } from '../../services/friendship.service';
import { SocketService } from '../../services/socket.service';
import { SoundService } from '../../services/sound.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss']
})
export class FriendsComponent implements OnInit, OnDestroy {
  friends: any[] = [];
  pendingReceived: any[] = [];
  pendingSent: any[] = [];
  searchResults: any[] = [];
  searchQuery = '';
  loading = true;
  activeTab: 'friends' | 'requests' | 'search' = 'friends';
  feedback: { type: 'success' | 'error'; message: string } | null = null;
  private subs: Subscription[] = [];

  profilePanelOpen = false;
  profilePanelUserId: string | null = null;
  profilePanelUsername: string | null = null;
  profilePanelAvatar: string | null = null;

  constructor(private friendship: FriendshipService, private socketService: SocketService, private soundService: SoundService) {}

  ngOnInit() {
    this.loadAll();
    this.subs.push(
      this.socketService.onFriendshipNewRequest().subscribe(() => {
        this.loadAll();
        this.soundService.play('friendRequest');
      }),
      this.socketService.onFriendshipUpdate().subscribe((data: any) => {
        this.loadAll();
        if (data?.status === 'accepted') {
          this.soundService.play('friendAccepted');
        }
      }),
      this.socketService.onFriendshipRemoved().subscribe(() => this.loadAll()),
    );
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  loadAll() {
    this.loading = true;
    this.friendship.listFriends().subscribe({
      next: (res) => this.friends = res.data || [],
      error: () => {}
    });
    this.friendship.listPending().subscribe({
      next: (res) => {
        this.pendingReceived = res.data?.received || [];
        this.pendingSent = res.data?.sent || [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  search() {
    if (this.searchQuery.trim().length < 2) { this.searchResults = []; return; }
    this.friendship.search(this.searchQuery.trim()).subscribe({
      next: (res) => this.searchResults = res.data || []
    });
  }

  sendRequest(userId: string) {
    this.friendship.sendRequest(userId).subscribe({
      next: (res) => {
        this.showFeedback('success', res.message || 'Solicitud enviada');
        this.searchResults = this.searchResults.filter(u => u._id !== userId);
        this.loadAll();
      },
      error: (err) => this.showFeedback('error', err.error?.message || 'Error al enviar solicitud')
    });
  }

  accept(id: string) {
    this.friendship.acceptRequest(id).subscribe({
      next: (res) => { this.showFeedback('success', res.message || 'Solicitud aceptada'); this.loadAll(); },
      error: (err) => this.showFeedback('error', err.error?.message || 'Error al aceptar solicitud')
    });
  }

  reject(id: string) {
    this.friendship.rejectRequest(id).subscribe({
      next: (res) => { this.showFeedback('success', res.message || 'Solicitud rechazada'); this.loadAll(); },
      error: (err) => this.showFeedback('error', err.error?.message || 'Error al rechazar solicitud')
    });
  }

  cancel(id: string) {
    this.friendship.cancelRequest(id).subscribe({
      next: (res) => { this.showFeedback('success', res.message || 'Solicitud cancelada'); this.loadAll(); },
      error: (err) => this.showFeedback('error', err.error?.message || 'Error al cancelar solicitud')
    });
  }

  remove(friendshipId: string) {
    this.friendship.removeFriend(friendshipId).subscribe({
      next: (res) => { this.showFeedback('success', res.message || 'Amigo eliminado'); this.loadAll(); },
      error: (err) => this.showFeedback('error', err.error?.message || 'Error al eliminar amigo')
    });
  }

  openProfile(userId: string, username: string, avatar: string) {
    this.profilePanelUserId = userId;
    this.profilePanelUsername = username;
    this.profilePanelAvatar = avatar;
    this.profilePanelOpen = true;
  }

  closeProfile() {
    this.profilePanelOpen = false;
    this.profilePanelUserId = null;
    this.profilePanelUsername = null;
    this.profilePanelAvatar = null;
  }

  private showFeedback(type: 'success' | 'error', message: string) {
    this.feedback = { type, message };
    setTimeout(() => this.feedback = null, 4000);
  }

  get pendingCount(): number {
    return this.pendingReceived.length;
  }
}
