import { Component, OnInit } from '@angular/core';
import { ReportsService } from '../../services/reports.service';
import { ChartConfiguration } from 'chart.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-dashboard-reports',
  templateUrl: './dashboard-reports.component.html',
  styleUrls: ['./dashboard-reports.component.scss']
})
export class DashboardReportsComponent implements OnInit {
  Math = Math;
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
    dateRange: { start: '', end: '' },
    params: {} as Record<string, any>
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
    this.currentCategoryFields = this.categoryFields['full'];
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
    const payload = {
      title: this.newReport.title,
      description: this.newReport.description,
      type: this.newReport.type,
      reportCategory: this.newReport.reportCategory,
      dateRange: this.newReport.dateRange,
      filters: { platforms: [], channels: [], users: [] },
      params: this.newReport.params
    };
    this.reportsService.createReport(payload).subscribe({
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

  exportPdf(report: any) {
    this.generateSignedPdf(report);
  }

  signReport(reportId: string) {
    const report = this.reports.find(r => r._id === reportId) || this.selectedReport;
    if (!report) return;

    if (report.signature) {
      if (!confirm('Este reporte ya esta firmado. Desea generar el PDF firmado de nuevo?')) return;
      this.generateSignedPdf(report);
      return;
    }

    if (!confirm('Se firmara este reporte y se descargara el PDF con la firma adjunta. Continuar?')) return;

    this.reportsService.signReport(reportId).subscribe({
      next: (res) => {
        const signatureData = res.data;
        const idx = this.reports.findIndex(r => r._id === reportId);
        if (idx !== -1) {
          this.reports[idx].signature = signatureData;
        }
        if (this.selectedReport?._id === reportId) {
          this.selectedReport.signature = signatureData;
        }
        const signedReport = { ...report, signature: signatureData };
        this.generateSignedPdf(signedReport);
      }
    });
  }

  generateSignedPdf(report: any) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(report.title || 'Reporte', pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Tipo: ${this.typeLabel(report.type)} | Categoria: ${report.reportCategory || 'full'}`, pageWidth / 2, y, { align: 'center' });
    y += 6;
    if (report.dateRange) {
      doc.text(`Periodo: ${this.formatDate(report.dateRange.start)} — ${this.formatDate(report.dateRange.end)}`, pageWidth / 2, y, { align: 'center' });
      y += 6;
    }
    doc.text(`Generado: ${this.formatDate(report.createdAt)}`, pageWidth / 2, y, { align: 'center' });
    y += 12;
    doc.setTextColor(0);

    const data = report.data;
    if (data && typeof data === 'object') {
      const sectionTitle = (title: string) => {
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text(title, 14, y);
        y += 2;
        doc.setDrawColor(200);
        doc.line(14, y, pageWidth - 14, y);
        y += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
      };

      const addRow = (label: string, value: any) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(label, 14, y);
        doc.text(String(value ?? '—'), 100, y);
        y += 6;
      };

      if (data.messages || data.tasks || data.surveys || data.ai || data.audit || data.kpis) {
        sectionTitle('Resumen Ejecutivo');
        if (data.messages) {
          addRow('Total Mensajes', data.messages.total || 0);
          addRow('Usuarios Unicos', data.messages.uniqueSenders || 0);
          addRow('Canales Totales', data.messages.totalChannels || 0);
          addRow('Canales Activos', data.messages.activeChannels || 0);
          addRow('Mensajes por Usuario', data.messages.messagesPerUser || 0);
        }
        if (data.tasks) {
          addRow('Total Tareas', data.tasks.total || 0);
          addRow('Tareas Completadas', data.tasks.completed || 0);
          addRow('Tasa de Completado', `${data.tasks.completionRate || 0}%`);
          addRow('Tareas Vencidas', data.tasks.overdue || 0);
        }
        if (data.surveys) {
          addRow('Total Encuestas', data.surveys.total || 0);
          addRow('Total Respuestas', data.surveys.totalResponses || 0);
        }
        if (data.ai) {
          addRow('Consultas IA', data.ai.totalQueries || 0);
          addRow('Costo Total (USD)', `$${data.ai.totalCost || 0}`);
          addRow('Tokens Totales', data.ai.totalTokens || 0);
        }
        if (data.audit) {
          addRow('Eventos de Auditoria', data.audit.totalEvents || 0);
          addRow('Logins Fallidos', data.audit.failedLogins || 0);
        }
        if (data.kpis) {
          addRow('Usuarios Activos', data.kpis.activeUsers || 0);
          addRow('Puntuacion Seguridad', data.kpis.securityScore || 'healthy');
        }
        y += 4;
      }

      if (data.messages?.topChannels?.length) {
        sectionTitle('Canales mas activos');
        autoTable(doc, {
          startY: y,
          head: [['#', 'Canal', 'Plataforma', 'Mensajes']],
          body: data.messages.topChannels.map((ch: any, i: number) => [
            String(i + 1), ch.name || '', ch.platform || '', String(ch.count)
          ]),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [139, 124, 246], fontStyle: 'bold' },
          margin: { left: 14, right: 14 }
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      if (data.messages?.topUsers?.length) {
        sectionTitle('Usuarios mas activos');
        autoTable(doc, {
          startY: y,
          head: [['#', 'Usuario', 'Mensajes']],
          body: data.messages.topUsers.map((u: any, i: number) => [
            String(i + 1), u.username || '', String(u.messageCount)
          ]),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [139, 124, 246], fontStyle: 'bold' },
          margin: { left: 14, right: 14 }
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      if (data.tasks) {
        sectionTitle('Desglose de Tareas');
        const taskSummaryBody = [
          ['Pendientes', String(data.tasks.byStatus?.pending || 0)],
          ['En Progreso', String(data.tasks.byStatus?.in_progress || 0)],
          ['Completadas', String(data.tasks.byStatus?.completed || 0)],
          ['Canceladas', String(data.tasks.byStatus?.cancelled || 0)],
        ];
        if (data.tasks.subtasks && data.tasks.subtasks.total > 0) {
          taskSummaryBody.push(['Subtareas', `${data.tasks.subtasks.completed}/${data.tasks.subtasks.total}`]);
        }
        if (data.tasks.byPriority) {
          taskSummaryBody.push(['', '']);
          taskSummaryBody.push(['Prioridad Baja', String(data.tasks.byPriority.low || 0)]);
          taskSummaryBody.push(['Prioridad Media', String(data.tasks.byPriority.medium || 0)]);
          taskSummaryBody.push(['Prioridad Alta', String(data.tasks.byPriority.high || 0)]);
          taskSummaryBody.push(['Prioridad Urgente', String(data.tasks.byPriority.urgent || 0)]);
        }
        autoTable(doc, {
          startY: y,
          head: [['Estado / Metrica', 'Cantidad']],
          body: taskSummaryBody,
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [139, 124, 246], fontStyle: 'bold' },
          margin: { left: 14, right: 14 }
        });
        y = (doc as any).lastAutoTable.finalY + 10;

        if (data.tasks.taskList?.length) {
          sectionTitle('Lista de Tareas');
          autoTable(doc, {
            startY: y,
            head: [['Titulo', 'Estado', 'Prioridad', 'Canal', 'Asignado', 'Subtareas', 'Vencimiento']],
            body: data.tasks.taskList.map((t: any) => [
              (t.title || '').substring(0, 30),
              t.status === 'completed' ? 'Completada' : t.status === 'in_progress' ? 'En progreso' : t.status === 'cancelled' ? 'Cancelada' : 'Pendiente',
              t.priority === 'urgent' ? 'Urgente' : t.priority === 'high' ? 'Alta' : t.priority === 'low' ? 'Baja' : 'Media',
              t.channelName || '—',
              t.assigneeName || 'Sin asignar',
              `${t.subtaskCompleted || 0}/${t.subtaskTotal || 0}`,
              t.dueDate ? new Date(t.dueDate).toLocaleDateString('es') : '—',
            ]),
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [139, 124, 246], fontStyle: 'bold', fontSize: 7 },
            margin: { left: 14, right: 14 },
            columnStyles: {
              0: { cellWidth: 35 },
              4: { cellWidth: 30 },
            }
          });
          y = (doc as any).lastAutoTable.finalY + 10;
        }
      }

      if (data.ai?.byModel?.length) {
        sectionTitle('Consultas por Modelo IA');
        autoTable(doc, {
          startY: y,
          head: [['Modelo', 'Consultas', 'Tokens', 'Costo (USD)']],
          body: data.ai.byModel.map((m: any) => [
            m.modelName || '', String(m.count), String(m.totalTokens), `$${m.totalCost}`
          ]),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [139, 124, 246], fontStyle: 'bold' },
          margin: { left: 14, right: 14 }
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }

      if (data.audit?.byCategory?.length) {
        sectionTitle('Eventos de Auditoria por Categoria');
        autoTable(doc, {
          startY: y,
          head: [['Categoria', 'Cantidad']],
          body: data.audit.byCategory.map((c: any) => [
            c.category || '', String(c.count)
          ]),
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: { fillColor: [139, 124, 246], fontStyle: 'bold' },
          margin: { left: 14, right: 14 }
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      }
    }

    // ============ BLOQUE DE FIRMA ============
    if (report.signature) {
      if (y > 200) { doc.addPage(); y = 20; }
      y += 10;

      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.5);
      doc.rect(14, y, pageWidth - 28, 60);
      y += 8;

      doc.setFillColor(245, 245, 245);
      doc.rect(14, y - 4, pageWidth - 28, 14, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40);
      doc.text('FIRMA DIGITAL DEL REPORTE', 14 + 4, y + 5);
      y += 16;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(60);

      doc.text('Firmado por:', 14 + 4, y);
      doc.setFont('helvetica', 'bold');
      doc.text(report.signature.signedBy || report.createdBy || 'Usuario', 46, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.text('Fecha de firma:', 14 + 4, y);
      doc.setFont('helvetica', 'bold');
      const sigDate = report.signature.timestamp || report.signature.signedAt || new Date().toISOString();
      doc.text(this.formatDate(sigDate), 54, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.text('Hash SHA-256:', 14 + 4, y);
      doc.setFont('courier', 'bold');
      doc.setFontSize(7);
      const hash = report.signature.hash || '';
      doc.text(hash.substring(0, 48), 48, y);
      if (hash.length > 48) {
        y += 5;
        doc.text(hash.substring(48, 96), 48, y);
      }
      y += 9;

      doc.setDrawColor(100);
      doc.setLineWidth(0.3);
      const lineY = y;
      doc.line(14 + 4, lineY, 100, lineY);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(130);
      doc.text('Firma del firmante', 14 + 4, lineY + 4);
      doc.line(pageWidth - 100, lineY, pageWidth - 14 - 4, lineY);
      doc.text('Fecha', pageWidth - 100, lineY + 4);

      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text('Este documento ha sido firmado digitalmente. La integridad del contenido puede verificarse con el hash SHA-256.', 14, y);
      y += 5;
      doc.text('Cualquier modificacion invalidara la firma.', 14, y);
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Pagina ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      doc.text('Generado por SlackBoard', 14, pageHeight - 10);
      if (report.signature) {
        doc.text('DOCUMENTO FIRMADO', pageWidth - 14, pageHeight - 10, { align: 'right' });
      }
    }

    const suffix = report.signature ? '_firmado' : '';
    doc.save(`${(report.title || 'reporte').replace(/[^a-zA-Z0-9]/g, '_')}${suffix}.pdf`);
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

  categoryFields: Record<string, { key: string; label: string; type: string; placeholder?: string; options?: { value: string; label: string }[] }[]> = {
    executive: [
      { key: 'includeRecommendations', label: 'Incluir recomendaciones', type: 'checkbox' },
      { key: 'compareToPrevious', label: 'Comparar con periodo anterior', type: 'checkbox' },
      { key: 'highlightTopPerformers', label: 'Destacar top performers', type: 'checkbox' },
    ],
    productivity: [
      { key: 'statusBreakdown', label: 'Desglose por estado', type: 'checkbox' },
      { key: 'priorityAnalysis', label: 'Analisis por prioridad', type: 'checkbox' },
      { key: 'assigneeStats', label: 'Estadisticas por asignado', type: 'checkbox' },
      { key: 'overdueAnalysis', label: 'Analisis de vencidas', type: 'checkbox' },
      { key: 'hoursTracking', label: 'Seguimiento de horas', type: 'checkbox' },
      { key: 'subtaskCompletion', label: 'Completado de subtareas', type: 'checkbox' },
    ],
    engagement: [
      { key: 'channelBreakdown', label: 'Desglose por canal', type: 'checkbox' },
      { key: 'peakHours', label: 'Horas pico', type: 'checkbox' },
      { key: 'activeUsers', label: 'Usuarios activos', type: 'checkbox' },
      { key: 'messageTypes', label: 'Tipos de mensaje', type: 'checkbox' },
      { key: 'retentionRate', label: 'Tasa de retencion', type: 'checkbox' },
      { key: 'responseTime', label: 'Tiempo de respuesta', type: 'checkbox' },
    ],
    ai: [
      { key: 'modelBreakdown', label: 'Desglose por modelo', type: 'checkbox' },
      { key: 'costAnalysis', label: 'Analisis de costos', type: 'checkbox' },
      { key: 'tokenUsage', label: 'Uso de tokens', type: 'checkbox' },
      { key: 'successRate', label: 'Tasa de exito', type: 'checkbox' },
      { key: 'avgResponseTime', label: 'Tiempo promedio de respuesta', type: 'checkbox' },
    ],
    security: [
      { key: 'failedLogins', label: 'Logins fallidos', type: 'checkbox' },
      { key: 'permissionChanges', label: 'Cambios de permisos', type: 'checkbox' },
      { key: 'auditByCategory', label: 'Auditoria por categoria', type: 'checkbox' },
      { key: 'ipTracking', label: 'Seguimiento por IP', type: 'checkbox' },
      { key: 'suspiciousActivity', label: 'Actividad sospechosa', type: 'checkbox' },
    ],
    full: [
      { key: 'includeAll', label: 'Incluir todos los datos', type: 'checkbox' },
      { key: 'compareToPrevious', label: 'Comparar con periodo anterior', type: 'checkbox' },
      { key: 'summaryOnly', label: 'Solo resumen ejecutivo', type: 'checkbox' },
    ]
  };

  currentCategoryFields: { key: string; label: string; type: string; placeholder?: string; options?: { value: string; label: string }[] }[] = [];

  onCategoryChange() {
    this.newReport.params = {};
    this.currentCategoryFields = this.categoryFields[this.newReport.reportCategory] || [];
  }

  private resetForm() {
    this.newReport = { title: '', description: '', type: 'weekly', reportCategory: 'full', dateRange: { start: '', end: '' }, params: {} };
    this.currentCategoryFields = this.categoryFields['full'];
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

  isOverdue(dueDate: string, status: string): boolean {
    if (status === 'completed' || status === 'cancelled') return false;
    return new Date(dueDate) < new Date();
  }

  openCreateModal() {
    this.currentCategoryFields = this.categoryFields[this.newReport.reportCategory] || [];
    this.showCreateModal = true;
  }

  closeAll() {
    this.showCreateModal = false;
    this.showDetailModal = false;
    this.showShareModal = false;
    this.selectedReport = null;
  }
}
