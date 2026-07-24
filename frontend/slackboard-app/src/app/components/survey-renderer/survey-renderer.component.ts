import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-survey-renderer',
  templateUrl: './survey-renderer.component.html',
  styleUrls: ['./survey-renderer.component.scss']
})
export class SurveyRendererComponent {
  @Input() message: any;
  @Output() openSurvey = new EventEmitter<string>();

  constructor(private router: Router) {}

  get surveyData(): any {
    return this.message?.surveyData || {};
  }

  get title(): string {
    return this.surveyData.title || 'Encuesta';
  }

  get description(): string {
    return this.surveyData.description || '';
  }

  get status(): string {
    return this.surveyData.status || 'active';
  }

  get questionsCount(): number {
    return this.surveyData.questionsCount || 0;
  }

  get questionsPreview(): { text: string; type: string }[] {
    return this.surveyData.questionsPreview || [];
  }

  get responseCount(): number {
    return this.surveyData.responseCount || 0;
  }

  get expiresAt(): string {
    if (!this.surveyData.expiresAt) return '';
    const d = new Date(this.surveyData.expiresAt);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  get isExpired(): boolean {
    if (!this.surveyData.expiresAt) return false;
    return new Date(this.surveyData.expiresAt) < new Date();
  }

  get anonymous(): boolean {
    return this.surveyData.anonymous || false;
  }

  get action(): string {
    return this.surveyData.action || 'created';
  }

  get statusLabel(): string {
    const labels: Record<string, string> = {
      draft: 'Borrador',
      active: 'Activa',
      closed: 'Cerrada',
    };
    return labels[this.status] || this.status;
  }

  getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      single_choice: 'Opcion unica',
      multiple_choice: 'Opcion multiple',
      text: 'Texto libre',
      rating: 'Calificacion',
      yes_no: 'Si / No',
    };
    return labels[type] || type;
  }

  onNavigate(): void {
    this.openSurvey.emit(this.surveyData.surveyId);
    this.router.navigate(['/dashboard'], { queryParams: { view: 'surveys', id: this.surveyData.surveyId } });
  }
}
