import { Component, OnInit } from '@angular/core';
import { AiMetricsService } from '../../services/ai-metrics.service';

@Component({
  selector: 'app-dashboard-ai-metrics',
  templateUrl: './dashboard-ai-metrics.component.html',
  styleUrls: ['./dashboard-ai-metrics.component.scss']
})
export class DashboardAiMetricsComponent implements OnInit {
  stats: any = null;
  metrics: any[] = [];
  models: any[] = [];
  departments: any[] = [];
  costs: any = null;
  performance: any = null;
  loading = true;
  activeTab: 'overview' | 'costs' | 'models' = 'overview';

  tokensChartData: any = null;
  costChartData: any = null;
  modelComparisonData: any = null;
  lineChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 10 } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
    },
    elements: { point: { radius: 2 }, line: { tension: 0.4, borderWidth: 2 } }
  };
  barChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)' } }
    }
  };
  doughnutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 }, color: 'rgba(255,255,255,0.5)' } } }
  };

  constructor(private aiMetricsService: AiMetricsService) {}

  ngOnInit() { this.loadAll(); }

  loadAll() {
    this.loading = true;
    Promise.all([
      this.aiMetricsService.getStats().toPromise(),
      this.aiMetricsService.getModels().toPromise(),
      this.aiMetricsService.getDepartments().toPromise(),
      this.aiMetricsService.getCosts().toPromise(),
      this.aiMetricsService.getPerformance().toPromise()
    ]).then(([stats, models, depts, costs, perf]) => {
      this.stats = stats?.data;
      this.models = models?.data || [];
      this.departments = depts?.data || [];
      this.costs = costs?.data;
      this.performance = perf?.data;
      this.buildCharts();
      this.loading = false;
    }).catch(() => { this.loading = false; });
  }

  buildCharts() {
    if (this.stats?.tokensPerDay?.length) {
      this.tokensChartData = {
        labels: this.stats.tokensPerDay.map((d: any) => d._id),
        datasets: [{ data: this.stats.tokensPerDay.map((d: any) => d.total), borderColor: '#8b7cf6', backgroundColor: 'rgba(139,124,246,0.1)', fill: true }]
      };
    }
    if (this.stats?.tokensPerDay?.length) {
      this.costChartData = {
        labels: this.stats.tokensPerDay.map((d: any) => d._id),
        datasets: [{ data: this.stats.tokensPerDay.map((d: any) => d.cost || 0), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', fill: true }]
      };
    }
    if (this.models.length) {
      this.modelComparisonData = {
        labels: this.models.map((m: any) => m._id || 'Unknown'),
        datasets: [{ data: this.models.map((m: any) => m.totalQueries || 0), backgroundColor: ['#8b7cf6','#f59e0b','#10b981','#3b82f6','#ec4899'] }]
      };
    }
  }

  formatCost(usd: number): string {
    if (!usd) return '$0.00';
    return '$' + usd.toFixed(4);
  }

  formatTokens(t: number): string {
    if (!t) return '0';
    if (t >= 1000000) return (t / 1000000).toFixed(1) + 'M';
    if (t >= 1000) return (t / 1000).toFixed(1) + 'K';
    return t.toString();
  }

  formatMs(ms: number): string {
    if (!ms) return '0ms';
    if (ms < 1000) return Math.round(ms) + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  timeAgo(date: string): string {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  }

  successRateColor(rate: number): string {
    if (rate >= 95) return '#10b981';
    if (rate >= 80) return '#f59e0b';
    return '#ef4444';
  }

  get totalQueries(): number {
    return this.stats?.totalQueries || 0;
  }

  get totalTokens(): number {
    return this.stats?.totalTokens || 0;
  }

  get totalCost(): number {
    return this.costs?.totalCost || this.stats?.totalCost || 0;
  }

  get avgResponseTime(): number {
    return this.performance?.avgResponseTime || this.stats?.avgResponseTime || 0;
  }

  get successRate(): number {
    return this.performance?.successRate ?? this.stats?.successRate ?? 0;
  }

  get recentMetrics(): any[] {
    return (this.metrics.length ? this.metrics : this.stats?.recentMetrics || []).slice(0, 10);
  }

  get modelCostBreakdown(): any[] {
    return this.costs?.byModel || this.models.map(m => ({
      _id: m._id,
      totalQueries: m.totalQueries,
      totalCost: m.totalCost || 0,
      costPerQuery: m.totalQueries ? (m.totalCost || 0) / m.totalQueries : 0
    }));
  }
}
