import { Component, OnInit } from '@angular/core';
import { SurveysService } from '../../services/surveys.service';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard-surveys',
  templateUrl: './dashboard-surveys.component.html',
  styleUrls: ['./dashboard-surveys.component.scss']
})
export class DashboardSurveysComponent implements OnInit {
  surveys: any[] = [];
  loading = true;
  showCreateModal = false;
  showResultsModal = false;
  showRespondModal = false;
  selectedSurvey: any = null;
  activeTab: 'surveys' | 'stats' = 'surveys';
  results: any = null;
  stats: any = null;
  creating = false;
  submitting = false;

  newSurvey = {
    title: '',
    description: '',
    expiresAt: '',
    questions: [] as any[]
  };

  responseAnswers: Record<number, any> = {};

  questionCharts: ChartConfiguration<'doughnut'>[] = [];
  ratingBarCharts: ChartConfiguration<'bar'>[] = [];

  statsOverviewChart: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: ['#8b7cf6', '#2FD4A8', '#FF6B47', '#6366f1', '#ECB22E', '#5865F2'] }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: 'rgba(255,255,255,0.5)' } } }
    }
  };

  statsResponsesChart: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], label: 'Respuestas', backgroundColor: 'rgba(139,124,246,0.6)', borderColor: '#8b7cf6', borderWidth: 1, borderRadius: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.3)' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  };

  private questionChartColors = ['#8b7cf6', '#2FD4A8', '#FF6B47', '#ECB22E', '#5865F2', '#6264A7', '#00AFF0', '#F472B6'];

  constructor(private surveysService: SurveysService) {}

  ngOnInit() {
    this.loadSurveys();
    this.loadStats();
  }

  loadSurveys() {
    this.loading = true;
    this.surveysService.getSurveys().subscribe({
      next: (res) => { this.surveys = res.data || []; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  loadStats() {
    this.surveysService.getStats().subscribe({
      next: (res) => {
        this.stats = res.data || null;
        if (this.stats) this.buildStatsCharts();
      }
    });
  }

  loadResults(survey: any) {
    this.selectedSurvey = survey;
    this.showResultsModal = true;
    this.results = null;
    this.surveysService.getResults(survey._id).subscribe({
      next: (res) => {
        this.results = res.data || null;
        if (this.results) this.buildResultCharts();
      }
    });
  }

  createSurvey() {
    if (!this.newSurvey.title || !this.newSurvey.questions.length) return;
    this.creating = true;
    const payload: any = { ...this.newSurvey };
    if (!payload.expiresAt) delete payload.expiresAt;
    this.surveysService.createSurvey(payload).subscribe({
      next: (res) => {
        this.surveys.unshift(res.data);
        this.showCreateModal = false;
        this.creating = false;
        this.resetForm();
        this.loadStats();
      },
      error: () => { this.creating = false; }
    });
  }

  activateSurvey(id: string) {
    this.surveysService.activateSurvey(id).subscribe({
      next: (res) => {
        const idx = this.surveys.findIndex(s => s._id === id);
        if (idx !== -1) this.surveys[idx].status = 'active';
      }
    });
  }

  closeSurvey(id: string) {
    this.surveysService.closeSurvey(id).subscribe({
      next: () => {
        const idx = this.surveys.findIndex(s => s._id === id);
        if (idx !== -1) this.surveys[idx].status = 'closed';
      }
    });
  }

  deleteSurvey(id: string) {
    this.surveysService.deleteSurvey(id).subscribe({
      next: () => {
        this.surveys = this.surveys.filter(s => s._id !== id);
        this.loadStats();
      }
    });
  }

  openRespond(survey: any) {
    this.selectedSurvey = survey;
    this.responseAnswers = {};
    this.showRespondModal = true;
    if (survey.questions) {
      survey.questions.forEach((_: any, i: number) => {
        this.responseAnswers[i] = '';
      });
    }
  }

  submitResponse() {
    if (!this.selectedSurvey) return;
    this.submitting = true;
    const answers = Object.entries(this.responseAnswers).map(([idx, value]) => ({
      questionIndex: parseInt(idx),
      value
    }));
    this.surveysService.submitResponse(this.selectedSurvey._id, answers).subscribe({
      next: () => {
        this.showRespondModal = false;
        this.submitting = false;
        const idx = this.surveys.findIndex(s => s._id === this.selectedSurvey._id);
        if (idx !== -1) this.surveys[idx].responseCount = (this.surveys[idx].responseCount || 0) + 1;
        this.loadStats();
      },
      error: () => { this.submitting = false; }
    });
  }

  addQuestion() {
    this.newSurvey.questions.push({
      text: '',
      type: 'single_choice',
      options: ['', ''],
      required: true
    });
  }

  removeQuestion(index: number) {
    this.newSurvey.questions.splice(index, 1);
  }

  addOption(qIndex: number) {
    this.newSurvey.questions[qIndex].options.push('');
  }

  removeOption(qIndex: number, oIndex: number) {
    this.newSurvey.questions[qIndex].options.splice(oIndex, 1);
  }

  formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatDateTime(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  statusColor(status: string): string {
    if (status === 'active') return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
    if (status === 'closed') return 'bg-white/[0.06] text-white/40 border-white/10';
    return 'bg-amber-400/10 text-amber-400 border-amber-400/20';
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = { draft: 'Borrador', active: 'Activa', closed: 'Cerrada' };
    return labels[status] || status;
  }

  statusDot(status: string): string {
    if (status === 'active') return 'bg-emerald-400';
    if (status === 'closed') return 'bg-white/30';
    return 'bg-amber-400 animate-pulse';
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      single_choice: 'Opcion unica',
      multiple_choice: 'Opcion multiple',
      text: 'Texto libre',
      rating: 'Calificacion',
      yes_no: 'Si / No'
    };
    return labels[type] || type;
  }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      single_choice: '◉',
      multiple_choice: '☑',
      text: '✎',
      rating: '★',
      yes_no: '𝔽'
    };
    return icons[type] || '•';
  }

  isChoiceType(type: string): boolean {
    return type === 'single_choice' || type === 'multiple_choice' || type === 'yes_no';
  }

  totalResponses(): number {
    return this.surveys.reduce((sum, s) => sum + (s.responseCount || 0), 0);
  }

  activeSurveysCount(): number {
    return this.surveys.filter(s => s.status === 'active').length;
  }

  completionRate(): number {
    if (!this.surveys.length) return 0;
    const closed = this.surveys.filter(s => s.status === 'closed').length;
    return Math.round((closed / this.surveys.length) * 100);
  }

  responseRate(): number {
    if (!this.stats?.totalPossibleResponses) return 0;
    return Math.round((this.totalResponses() / this.stats.totalPossibleResponses) * 100);
  }

  private buildResultCharts() {
    this.questionCharts = [];
    this.ratingBarCharts = [];
    if (!this.results?.questions) return;

    this.results.questions.forEach((q: any, i: number) => {
      if (this.isChoiceType(q.type) && q.distribution) {
        const labels = q.distribution.map((d: any) => d.option || d.label || d.value);
        const data = q.distribution.map((d: any) => d.count);
        const chart: ChartConfiguration<'doughnut'> = {
          type: 'doughnut',
          data: { labels, datasets: [{ data, backgroundColor: this.questionChartColors.slice(0, data.length) }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: 'rgba(255,255,255,0.5)' } } }
          }
        };
        this.questionCharts[i] = chart;
      }

      if (q.type === 'rating' && q.distribution) {
        const labels = q.distribution.map((d: any) => `${d.option || d.value} ★`);
        const data = q.distribution.map((d: any) => d.count);
        const chart: ChartConfiguration<'bar'> = {
          type: 'bar',
          data: { labels, datasets: [{ data, label: 'Votos', backgroundColor: 'rgba(139,124,246,0.6)', borderColor: '#8b7cf6', borderWidth: 1, borderRadius: 6 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
              y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.3)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
            }
          }
        };
        this.ratingBarCharts[i] = chart;
      }
    });
  }

  private buildStatsCharts() {
    if (!this.stats) return;

    if (this.stats.byStatus) {
      const labels = this.stats.byStatus.map((s: any) => this.statusLabel(s.status || s._id));
      const data = this.stats.byStatus.map((s: any) => s.count);
      this.statsOverviewChart = {
        ...this.statsOverviewChart,
        data: { labels, datasets: [{ ...this.statsOverviewChart.data.datasets[0], data }] }
      };
    }

    if (this.stats.recentActivity) {
      const labels = this.stats.recentActivity.map((a: any) =>
        new Date(a.date || a._id).toLocaleDateString('es', { day: '2-digit', month: 'short' })
      );
      const data = this.stats.recentActivity.map((a: any) => a.count || a.responses);
      this.statsResponsesChart = {
        ...this.statsResponsesChart,
        data: { labels, datasets: [{ ...this.statsResponsesChart.data.datasets[0], data }] }
      };
    }
  }

  private resetForm() {
    this.newSurvey = { title: '', description: '', expiresAt: '', questions: [] };
  }

  closeAll() {
    this.showCreateModal = false;
    this.showResultsModal = false;
    this.showRespondModal = false;
    this.selectedSurvey = null;
    this.results = null;
  }
}
