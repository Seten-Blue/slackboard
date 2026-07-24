import { Component, OnInit, OnDestroy } from '@angular/core';
import { PerformanceService } from '../../services/performance.service';

@Component({
  selector: 'app-dashboard-performance',
  templateUrl: './dashboard-performance.component.html',
  styleUrls: ['./dashboard-performance.component.scss']
})
export class DashboardPerformanceComponent implements OnInit, OnDestroy {
  snapshot: any = null;
  history: any[] = [];
  alerts: any[] = [];
  loading = true;
  autoRefreshId: any = null;

  cpuChartData: any = null;
  memoryChartData: any = null;
  dbLatencyChartData: any = null;
  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } } }
    },
    elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } }
  };

  constructor(private perfService: PerformanceService) {}

  ngOnInit() {
    this.loadAll();
    this.autoRefreshId = setInterval(() => this.loadSnapshot(), 30000);
  }

  ngOnDestroy() {
    if (this.autoRefreshId) clearInterval(this.autoRefreshId);
  }

  loadAll() {
    this.loading = true;
    Promise.all([
      this.perfService.getSnapshot().toPromise(),
      this.perfService.getHistory(24).toPromise(),
      this.perfService.getAlerts().toPromise()
    ]).then(([snap, hist, alerts]) => {
      this.snapshot = snap?.data;
      this.history = hist?.data || [];
      this.alerts = alerts?.data || [];
      this.buildCharts();
      this.loading = false;
    }).catch(() => { this.loading = false; });
  }

  loadSnapshot() {
    this.perfService.getSnapshot().subscribe({
      next: (res) => {
        this.snapshot = res?.data;
        this.history.unshift(this.snapshot);
        if (this.history.length > 100) this.history.pop();
        this.buildCharts();
      }
    });
  }

  buildCharts() {
    if (!this.history.length) return;
    const labels = this.history.map((h: any) => {
      const d = new Date(h.timestamp);
      return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    });

    this.cpuChartData = {
      labels,
      datasets: [{
        data: this.history.map((h: any) => h?.server?.cpu?.usagePercent || 0),
        borderColor: '#8b7cf6',
        backgroundColor: 'rgba(139,124,246,0.1)',
        fill: true
      }]
    };

    this.memoryChartData = {
      labels,
      datasets: [{
        data: this.history.map((h: any) => h?.server?.memory?.usagePercent || 0),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.1)',
        fill: true
      }]
    };

    this.dbLatencyChartData = {
      labels,
      datasets: [{
        data: this.history.map((h: any) => h?.database?.latencyMs || 0),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16,185,129,0.1)',
        fill: true
      }]
    };
  }

  gaugeColor(percent: number): string {
    if (percent > 80) return '#ef4444';
    if (percent > 60) return '#f59e0b';
    return '#10b981';
  }

  gaugeBg(percent: number): string {
    return `conic-gradient(${this.gaugeColor(percent)} ${percent * 3.6}deg, rgba(255,255,255,0.05) 0deg)`;
  }

  statusColor(configured: boolean): string {
    return configured ? '#10b981' : '#6b7280';
  }

  severityColor(severity: string): string {
    return severity === 'high' ? '#ef4444' : severity === 'medium' ? '#f59e0b' : '#3b82f6';
  }

  severityIcon(severity: string): string {
    return severity === 'high' ? '!!' : severity === 'medium' ? '!' : 'i';
  }

  formatKB(kb: number): string {
    if (!kb) return '0 B';
    const bytes = kb * 1024;
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatBytes(bytes: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  formatMs(ms: number): string {
    if (ms < 1) return '<1ms';
    return `${Math.round(ms)}ms`;
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

  integrationIcon(name: string): string {
    const icons: Record<string, string> = {
      'slack': 'S', 'discord': 'D', 'trello': 'T', 'ai (gemini)': 'AI', 'whatsapp': 'W'
    };
    return icons[name?.toLowerCase()] || name?.charAt(0) || '?';
  }

  integrationKey(name: string): string {
    return name?.toLowerCase().replace(/[^a-z]/g, '') || '';
  }
}
