import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-poll-renderer',
  templateUrl: './poll-renderer.component.html',
  styleUrls: ['./poll-renderer.component.scss']
})
export class PollRendererComponent implements OnChanges {
  @Input() message: any;
  @Input() currentUserId: string = '';

  totalVotes = 0;
  hasVoted = false;
  votedIndex = -1;
  showResults = false;
  expired = false;
  timeLeft = '';

  constructor(private chatService: ChatService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['message'] || changes['currentUserId']) {
      this.calculateStats();
    }
  }

  private calculateStats() {
    const poll = this.message?.pollData;
    if (!poll) return;
    
    this.totalVotes = 0;
    this.hasVoted = false;
    this.votedIndex = -1;

    poll.options.forEach((opt: any, i: number) => {
      this.totalVotes += opt.voters?.length || 0;
      if (opt.voters?.some((v: any) => (v._id || v) === this.currentUserId)) {
        this.hasVoted = true;
        this.votedIndex = i;
      }
    });

    if (poll.expiresAt) {
      const now = new Date();
      const exp = new Date(poll.expiresAt);
      if (now > exp) {
        this.expired = true;
      } else {
        this.expired = false;
        this.updateTimeLeft(exp, now);
      }
    }
  }

  private updateTimeLeft(exp: Date, now: Date) {
    const diff = exp.getTime() - now.getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) this.timeLeft = `${hours}h ${mins}m restantes`;
    else this.timeLeft = `${mins}m restantes`;
  }

  getPercentage(voters: any[]): number {
    if (this.totalVotes === 0) return 0;
    return Math.round(((voters?.length || 0) / this.totalVotes) * 100);
  }

  vote(optionIndex: number) {
    if (this.expired || !this.message?._id) return;
    
    this.chatService.votePoll(this.message._id, optionIndex).subscribe({
      next: (response) => {
        if (response.success) {
          this.message.pollData = response.data.pollData;
          this.calculateStats();
        }
      },
      error: (err) => console.error('Error voting:', err)
    });
  }

  isMyVote(voters: any[]): boolean {
    return voters?.some((v: any) => (v._id || v) === this.currentUserId) || false;
  }
}
