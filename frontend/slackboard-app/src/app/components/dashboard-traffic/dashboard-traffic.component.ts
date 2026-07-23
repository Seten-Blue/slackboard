import { Component, OnInit } from '@angular/core';
import { AnalyticsService } from '../../services/analytics.service';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard-traffic',
  templateUrl: './dashboard-traffic.component.html',
  styleUrls: ['./dashboard-traffic.component.scss']
})
export class DashboardTrafficComponent implements OnInit {
  data: any = null;
  loading = true;

  msgsPerMinChart: ChartConfiguration<'line'> = {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], label: 'Mensajes/min', borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)', fill: true, tension: 0.3, pointRadius: 0 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { beginAtZero: true } } }
  };

  platformChart: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: ['#ECB22E', '#5865F2', '#25D366', '#6264A7', '#00AFF0', '#9CA3AF'] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }
  };

  constructor(private analytics: AnalyticsService) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.analytics.getTraffic().subscribe({
      next: (res) => {
        this.data = res.data;
        this.buildCharts();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  buildCharts() {
    if (this.data?.msgsPerMinute?.length) {
      const labels = this.data.msgsPerMinute.map((m: any) => `${String(m.time.hour).padStart(2, '0')}:${String(m.time.minute).padStart(2, '0')}`);
      const values = this.data.msgsPerMinute.map((m: any) => m.count);
      this.msgsPerMinChart = { ...this.msgsPerMinChart, data: { labels, datasets: [{ ...this.msgsPerMinChart.data.datasets[0], data: values }] } };
    }
    if (this.data?.platformTraffic?.length) {
      this.platformChart = { ...this.platformChart, data: { labels: this.data.platformTraffic.map((p: any) => p.platform || 'other'), datasets: [{ ...this.platformChart.data.datasets[0], data: this.data.platformTraffic.map((p: any) => p.count) }] } };
    }
  }

  ramPercent(): number {
    return this.data?.serverResources?.ramPercent || 0;
  }

  uptimeFormatted(): string {
    const s = this.data?.serverResources?.uptime || 0;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
}
