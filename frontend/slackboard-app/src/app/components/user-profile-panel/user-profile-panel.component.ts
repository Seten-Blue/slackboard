import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { FriendshipService } from '../../services/friendship.service';

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

  constructor(private friendshipService: FriendshipService) {}

  ngOnInit() { this.loadFriendship(); }

  ngOnChanges() {
    if (this.isOpen && this.userId) this.loadFriendship();
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
}
