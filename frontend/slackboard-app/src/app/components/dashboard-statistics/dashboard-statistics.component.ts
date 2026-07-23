import { Component, OnInit } from '@angular/core';
import { AnalyticsService } from '../../services/analytics.service';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard-statistics',
  templateUrl: './dashboard-statistics.component.html',
  styleUrls: ['./dashboard-statistics.component.scss']
})
export class DashboardStatisticsComponent implements OnInit {
  data: any = null;
  loading = true;

  msgEvolutionChart: ChartConfiguration<'line'> = {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], label: 'Mensajes', borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.3, pointRadius: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } }, y: { beginAtZero: true } } }
  };

  userGrowthChart: ChartConfiguration<'line'> = {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], label: 'Usuarios', borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.3, pointRadius: 1 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 10, font: { size: 10 } } }, y: { beginAtZero: true } } }
  };

  constructor(private analytics: AnalyticsService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.analytics.getStats().subscribe({
      next: (res) => { this.data = res.data; this.buildCharts(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  buildCharts() {
    if (this.data?.messageEvolution?.length) {
      const labels = this.data.messageEvolution.map((d: any) => new Date(d.date).toLocaleDateString('es', { day: '2-digit', month: 'short' }));
      this.msgEvolutionChart = { ...this.msgEvolutionChart, data: { labels, datasets: [{ ...this.msgEvolutionChart.data.datasets[0], data: this.data.messageEvolution.map((d: any) => d.count) }] } };
    }
    if (this.data?.userGrowth?.length) {
      const labels = this.data.userGrowth.map((d: any) => new Date(d.date).toLocaleDateString('es', { day: '2-digit', month: 'short' }));
      this.userGrowthChart = { ...this.userGrowthChart, data: { labels, datasets: [{ ...this.userGrowthChart.data.datasets[0], data: this.data.userGrowth.map((d: any) => d.count) }] } };
    }
  }

  heatmapColor(count: number, max: number): string {
    if (!count || !max) return 'rgba(99,102,241,0.03)';
    const intensity = count / max;
    return `rgba(99, 102, 241, ${0.05 + intensity * 0.6})`;
  }

  dayName(d: number): string {
    return ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][d - 1] || '';
  }

  private _heatmapMax = 0;
  getHeatmapMax(): number {
    if (this._heatmapMax === 0 && this.data?.heatmap?.length) {
      this._heatmapMax = Math.max(...this.data.heatmap.map((h: any) => h.count));
    }
    return this._heatmapMax;
  }

  getHeatmapVal(day: number, hour: number): number {
    const entry = this.data?.heatmap?.find((h: any) => h.day === day && h.hour === hour);
    return entry?.count || 0;
  }

  getReactionPercent(count: number): number {
    const max = Math.max(...(this.data?.reactionDistribution || []).map((r: any) => r.count), 1);
    return Math.round((count / max) * 100);
  }

  getFilePercent(count: number): number {
    const max = Math.max(...(this.data?.fileTypeDistribution || []).map((f: any) => f.count), 1);
    return Math.round((count / max) * 100);
  }

  getTotalMessages(): number {
    return (this.data?.messageEvolution || []).reduce((sum: number, d: any) => sum + (d.count || 0), 0);
  }
}
