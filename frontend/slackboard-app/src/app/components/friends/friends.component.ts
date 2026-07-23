import { Component, OnInit } from '@angular/core';
import { FriendshipService } from '../../services/friendship.service';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss']
})
export class FriendsComponent implements OnInit {
  friends: any[] = [];
  pendingReceived: any[] = [];
  pendingSent: any[] = [];
  searchResults: any[] = [];
  searchQuery = '';
  loading = true;
  activeTab: 'friends' | 'requests' | 'search' = 'friends';

  constructor(private friendship: FriendshipService) {}

  ngOnInit() { this.loadAll(); }

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
      next: () => {
        this.searchResults = this.searchResults.filter(u => u._id !== userId);
        this.loadAll();
      }
    });
  }

  accept(id: string) {
    this.friendship.acceptRequest(id).subscribe({ next: () => this.loadAll() });
  }

  reject(id: string) {
    this.friendship.rejectRequest(id).subscribe({ next: () => this.loadAll() });
  }

  cancel(id: string) {
    this.friendship.cancelRequest(id).subscribe({ next: () => this.loadAll() });
  }

  remove(friendshipId: string) {
    this.friendship.removeFriend(friendshipId).subscribe({ next: () => this.loadAll() });
  }

  get pendingCount(): number {
    return this.pendingReceived.length;
  }
}
