import { Component, OnInit } from '@angular/core';
import { ReportsService } from '../../services/reports.service';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard-reports',
  templateUrl: './dashboard-reports.component.html',
  styleUrls: ['./dashboard-reports.component.scss']
})
export class DashboardReportsComponent implements OnInit {
  reports: any[] = [];
  scheduledReports: any[] = [];
  loading = true;
  showCreateModal = false;
  showDetailModal = false;
  selectedReport: any = null;
  activeTab: 'reports' | 'scheduled' = 'reports';

  newReport = {
    title: '',
    description: '',
    type: 'weekly' as string,
    reportCategory: 'full' as string,
    dateRange: {
      start: '',
      end: ''
    }
  };
  creating = false;
  showShareModal = false;
  shareUserId = '';
  sharePermission = 'view';

  datePresets = [
    { label: 'Ultimos 7 dias', days: 7 },
    { label: 'Ultimos 14 dias', days: 14 },
    { label: 'Ultimos 30 dias', days: 30 },
    { label: 'Este mes', days: 0 },
    { label: 'Mes anterior', days: -1 },
  ];

  messagesChart: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        label: 'Mensajes',
        borderColor: '#8b7cf6',
        backgroundColor: 'rgba(139,124,246,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointBackgroundColor: '#8b7cf6'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 10, font: { size: 10 }, color: 'rgba(255,255,255,0.3)' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.3)' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  };

  platformChart: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: ['#ECB22E', '#5865F2', '#25D366', '#6264A7', '#00AFF0', '#8b7cf6']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 }, color: 'rgba(255,255,255,0.5)' }
        }
      }
    }
  };

  constructor(private reportsService: ReportsService) {}

  ngOnInit() {
    this.loadReports();
    this.loadScheduled();
  }

  loadReports() {
    this.loading = true;
    this.reportsService.getReports().subscribe({
      next: (res) => {
        this.reports = res.data || [];
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadScheduled() {
    this.reportsService.getScheduledReports().subscribe({
      next: (res) => { this.scheduledReports = res.data || []; }
    });
  }

  createReport() {
    if (!this.newReport.title || !this.newReport.dateRange.start || !this.newReport.dateRange.end) return;
    this.creating = true;
    this.reportsService.createReport(this.newReport).subscribe({
      next: (res) => {
        this.reports.unshift(res.data);
        this.showCreateModal = false;
        this.creating = false;
        this.resetForm();
      },
      error: () => { this.creating = false; }
    });
  }

  viewReport(report: any) {
    this.selectedReport = report;
    this.showDetailModal = true;
    if (report.data) {
      this.buildReportCharts(report.data);
    } else {
      this.reportsService.getReport(report._id).subscribe({
        next: (res) => {
          this.selectedReport = res.data || report;
          this.buildReportCharts(this.selectedReport.data || {});
        }
      });
    }
  }

  buildReportCharts(data: any) {
    const messagesPerDay = data.messages?.messagesPerDay || data.messagesPerDay || [];
    if (messagesPerDay.length) {
      const labels = messagesPerDay.map((d: any) =>
        new Date(d.date).toLocaleDateString('es', { day: '2-digit', month: 'short' })
      );
      this.messagesChart = {
        ...this.messagesChart,
        data: {
          labels,
          datasets: [{
            ...this.messagesChart.data.datasets[0],
            data: messagesPerDay.map((d: any) => d.count)
          }]
        }
      };
    }
    const topChannels = data.messages?.topChannels || [];
    if (topChannels.length) {
      this.platformChart = {
        ...this.platformChart,
        data: {
          labels: topChannels.map((ch: any) => ch.name || ch.platform),
          datasets: [{
            ...this.platformChart.data.datasets[0],
            data: topChannels.map((ch: any) => ch.count)
          }]
        }
      };
    }
  }

  exportReport(reportId: string, format: string) {
    this.reportsService.exportReport(reportId, format).subscribe({
      next: (data) => {
        const content = format === 'csv' ? data : JSON.stringify(data, null, 2);
        const mime = format === 'csv' ? 'text/csv' : 'application/json';
        const blob = new Blob([content], { type: mime });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-${reportId}.${format}`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    });
  }

  signReport(reportId: string) {
    this.reportsService.signReport(reportId).subscribe({
      next: (res) => {
        const idx = this.reports.findIndex(r => r._id === reportId);
        if (idx !== -1) {
          this.reports[idx].signature = res.data;
        }
        if (this.selectedReport?._id === reportId) {
          this.selectedReport.signature = res.data;
        }
      }
    });
  }

  openShare(reportId: string) {
    this.selectedReport = this.reports.find(r => r._id === reportId);
    this.showShareModal = true;
  }

  shareReport() {
    if (!this.selectedReport || !this.shareUserId) return;
    this.reportsService.shareReport(this.selectedReport._id, this.shareUserId, this.sharePermission).subscribe({
      next: () => {
        this.showShareModal = false;
        this.shareUserId = '';
        this.sharePermission = 'view';
      }
    });
  }

  deleteReport(reportId: string) {
    if (!confirm('Eliminar este reporte?')) return;
    this.reportsService.deleteReport(reportId).subscribe({
      next: () => { this.reports = this.reports.filter(r => r._id !== reportId); }
    });
  }

  deleteScheduled(id: string) {
    if (!confirm('Eliminar reporte programado?')) return;
    this.reportsService.deleteScheduledReport(id).subscribe({
      next: () => { this.scheduledReports = this.scheduledReports.filter(r => r._id !== id); }
    });
  }

  private resetForm() {
    this.newReport = { title: '', description: '', type: 'weekly', reportCategory: 'full', dateRange: { start: '', end: '' } };
  }

  applyPreset(preset: { label: string; days: number }) {
    const end = new Date();
    if (preset.days === 0) {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      this.newReport.dateRange.start = start.toISOString().split('T')[0];
      this.newReport.dateRange.end = end.toISOString().split('T')[0];
    } else if (preset.days === -1) {
      const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
      const lastDay = new Date(end.getFullYear(), end.getMonth(), 0);
      this.newReport.dateRange.start = start.toISOString().split('T')[0];
      this.newReport.dateRange.end = lastDay.toISOString().split('T')[0];
    } else {
      const start = new Date(end.getTime() - preset.days * 86400000);
      this.newReport.dateRange.start = start.toISOString().split('T')[0];
      this.newReport.dateRange.end = end.toISOString().split('T')[0];
    }
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = { daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual', custom: 'Personalizado' };
    return labels[type] || type;
  }

  statusColor(status: string): string {
    if (status === 'completed') return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
    if (status === 'generating') return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
    return 'bg-red-400/10 text-red-400 border-red-400/20';
  }

  statusDot(status: string): string {
    if (status === 'completed') return 'bg-emerald-400';
    if (status === 'generating') return 'bg-amber-400 animate-pulse';
    return 'bg-red-400';
  }

  changeIcon(val: number): string {
    return val > 0 ? '↑' : val < 0 ? '↓' : '—';
  }

  changeColor(val: number): string {
    return val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-white/30';
  }

  closeAll() {
    this.showCreateModal = false;
    this.showDetailModal = false;
    this.showShareModal = false;
    this.selectedReport = null;
  }
}
