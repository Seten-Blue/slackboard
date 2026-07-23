import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { FriendshipService } from '../../services/friendship.service';
import { AuthService, AuthUser } from '../../services/auth.service';

@Component({
  selector: 'app-user-profile-panel',
  templateUrl: './user-profile-panel.component.html',
  styleUrls: ['./user-profile-panel.component.scss']
})
export class UserProfilePanelComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() userId: string | null = null;
  @Input() username: string | null = null;
  @Input() avatar: string | null = null;
  @Output() close = new EventEmitter<void>();

  friendship: any = null;
  loading = false;
  actionLoading = false;

  userProfile: any = null;
  loadingProfile = false;
  commonInterests: string[] = [];

  constructor(
    private friendshipService: FriendshipService,
    private authService: AuthService
  ) {}

  ngOnInit() { this.loadAll(); }

  ngOnChanges() {
    if (this.isOpen && this.userId) this.loadAll();
  }

  private loadAll() {
    this.loadFriendship();
    this.loadUserProfile();
  }

  loadFriendship() {
    if (!this.userId) return;
    this.loading = true;
    this.friendshipService.listFriends().subscribe({
      next: (res) => {
        const friends = res.data || [];
        this.friendship = friends.find((f: any) => f._id === this.userId) || null;
        if (!this.friendship) this.loadPending();
        else { this.friendship.status = 'accepted'; this.loading = false; }
      },
      error: () => { this.loading = false; }
    });
  }

  private loadPending() {
    this.friendshipService.listPending().subscribe({
      next: (res) => {
        const received = (res.data?.received || []).find((r: any) => r.from?._id === this.userId);
        const sent = (res.data?.sent || []).find((r: any) => r.to?._id === this.userId);
        if (received) {
          this.friendship = { _id: received._id, status: 'received', username: this.username };
        } else if (sent) {
          this.friendship = { _id: sent._id, status: 'sent', username: this.username };
        } else {
          this.friendship = null;
        }
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private loadUserProfile() {
    if (!this.userId) return;
    this.loadingProfile = true;
    this.friendshipService.getUserProfile(this.userId).subscribe({
      next: (res) => {
        this.userProfile = res.data || null;
        this.loadingProfile = false;
        this.calculateCommonInterests();
      },
      error: () => { this.loadingProfile = false; }
    });
  }

  private calculateCommonInterests() {
    this.commonInterests = [];
    const currentUser = this.authService.currentUser;
    if (!currentUser?.intereses?.length || !this.userProfile?.intereses?.length) return;

    const userSet = new Set(currentUser.intereses.map((i: string) => i.toLowerCase()));
    this.commonInterests = this.userProfile.intereses.filter((i: string) => userSet.has(i.toLowerCase()));
  }

  sendRequest() {
    if (!this.userId || this.actionLoading) return;
    this.actionLoading = true;
    this.friendshipService.sendRequest(this.userId).subscribe({
      next: () => { this.loadFriendship(); this.actionLoading = false; },
      error: () => { this.actionLoading = false; }
    });
  }

  acceptRequest() {
    if (!this.friendship?._id || this.actionLoading) return;
    this.actionLoading = true;
    this.friendshipService.acceptRequest(this.friendship._id).subscribe({
      next: () => { this.loadFriendship(); this.actionLoading = false; },
      error: () => { this.actionLoading = false; }
    });
  }

  rejectRequest() {
    if (!this.friendship?._id || this.actionLoading) return;
    this.actionLoading = true;
    this.friendshipService.rejectRequest(this.friendship._id).subscribe({
      next: () => { this.loadFriendship(); this.actionLoading = false; },
      error: () => { this.actionLoading = false; }
    });
  }

  cancelRequest() {
    if (!this.friendship?._id || this.actionLoading) return;
    this.actionLoading = true;
    this.friendshipService.cancelRequest(this.friendship._id).subscribe({
      next: () => { this.loadFriendship(); this.actionLoading = false; },
      error: () => { this.actionLoading = false; }
    });
  }

  removeFriend() {
    if (!this.friendship?._id || this.actionLoading) return;
    this.actionLoading = true;
    this.friendshipService.removeFriend(this.friendship._id).subscribe({
      next: () => { this.loadFriendship(); this.actionLoading = false; },
      error: () => { this.actionLoading = false; }
    });
  }

  onClose() {
    this.close.emit();
  }

  get initials(): string {
    const name = this.userProfile?.nombre || this.userProfile?.username || this.username || '?';
    return name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
  }

  get memberSince(): string {
    if (!this.userProfile?.createdAt) return '';
    const date = new Date(this.userProfile.createdAt);
    return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
}
