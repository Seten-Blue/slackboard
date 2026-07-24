import { Component, OnInit } from '@angular/core';
import { AuditService } from '../../services/audit.service';

@Component({
  selector: 'app-dashboard-audit',
  templateUrl: './dashboard-audit.component.html',
  styleUrls: ['./dashboard-audit.component.scss']
})
export class DashboardAuditComponent implements OnInit {
  logs: any[] = [];
  stats: any = null;
  topActors: any[] = [];
  loading = true;
  searchQuery = '';
  filterCategory = '';
  filterSuccess = '';
  activeTab: 'logs' | 'stats' = 'logs';
  currentPage = 1;
  totalPages = 1;

  categoryChartData: any = null;
  timelineChartData: any = null;
  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
    }
  };
  doughnutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, color: 'rgba(255,255,255,0.5)' } } }
  };

  constructor(private auditService: AuditService) {}

  ngOnInit() { this.loadLogs(); this.loadStats(); }

  loadLogs() {
    this.loading = true;
    const params: any = { page: this.currentPage, limit: 20 };
    if (this.filterCategory) params.category = this.filterCategory;
    if (this.filterSuccess) params.success = this.filterSuccess;
    if (this.searchQuery) { this.auditService.search(this.searchQuery).subscribe({ next: (res) => { this.logs = res.data || []; this.loading = false; } }); return; }
    this.auditService.getLogs(params).subscribe({
      next: (res) => { this.logs = res.data || []; this.totalPages = res.pagination?.pages || 1; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  loadStats() {
    this.auditService.getStats().subscribe({
      next: (res) => {
        this.stats = res.data;
        this.topActors = (this.stats?.topActors || []).slice(0, 5);
        if (this.stats?.byCategory) {
          const cats = this.stats.byCategory;
          this.categoryChartData = {
            labels: cats.map((c: any) => c._id),
            datasets: [{ data: cats.map((c: any) => c.count), backgroundColor: ['#8b7cf6','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#6366f1','#14b8a6','#f97316','#6b7280'] }]
          };
        }
        if (this.stats?.hourlyTimeline) {
          const timeline = this.stats.hourlyTimeline;
          this.timelineChartData = {
            labels: timeline.map((t: any) => `${t._id}h`),
            datasets: [{ data: timeline.map((t: any) => t.count), borderColor: '#8b7cf6', backgroundColor: 'rgba(139,124,246,0.1)', fill: true }]
          };
        }
      }
    });
  }

  onSearch() { this.currentPage = 1; this.loadLogs(); }
  onFilter() { this.currentPage = 1; this.loadLogs(); }
  prevPage() { if (this.currentPage > 1) { this.currentPage--; this.loadLogs(); } }
  nextPage() { if (this.currentPage < this.totalPages) { this.currentPage++; this.loadLogs(); } }

  categoryIcon(cat: string): string {
    const icons: Record<string, string> = { auth: '🔑', permissions: '🛡', config: '⚙', create: '➕', modify: '✏', delete: '🗑', access: '👁', integration: '🔗', api: '📡', ai: '🤖' };
    return icons[cat] || '📋';
  }

  categoryColor(cat: string): string {
    const colors: Record<string, string> = {
      auth: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
      permissions: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
      config: 'text-white/50 bg-white/[0.06] border-white/10',
      create: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
      modify: 'text-signal bg-signal/10 border-signal/20',
      delete: 'text-red-400 bg-red-400/10 border-red-400/20',
      access: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
      integration: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
      api: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
      ai: 'text-pink-400 bg-pink-400/10 border-pink-400/20'
    };
    return colors[cat] || 'text-white/40 bg-white/[0.06] border-white/10';
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

  formatDate(d: string): string {
    return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
