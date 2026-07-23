import { Component, OnInit } from '@angular/core';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-dashboard-activity',
  templateUrl: './dashboard-activity.component.html',
  styleUrls: ['./dashboard-activity.component.scss']
})
export class DashboardActivityComponent implements OnInit {
  data: any = null;
  loading = true;

  constructor(private analytics: AnalyticsService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.analytics.getActivity().subscribe({
      next: (res) => { this.data = res.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  timeAgo(date: string): string {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  }

  platformIcon(p: string): string {
    const m: Record<string, string> = { slack: '💬', discord: '🎮', whatsapp: '📱', teams: '💼', skype: '📞', other: '🌐' };
    return m[p] || '🌐';
  }
}
