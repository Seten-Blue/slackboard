import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-task-renderer',
  templateUrl: './task-renderer.component.html',
  styleUrls: ['./task-renderer.component.scss']
})
export class TaskRendererComponent {
  @Input() message: any;
  @Output() openTask = new EventEmitter<string>();

  constructor(private router: Router) {}

  get taskData(): any {
    if (this.message?.taskData) return this.message.taskData;
    return this.parseLegacyTaskData();
  }

  private parseLegacyTaskData(): any {
    const content = this.message?.content || '';
    let title = '';
    let description = '';
    let status = 'pending';
    let priority = 'medium';
    let assigneeName: string | null = null;
    let dueDate: Date | null = null;
    let action: 'created' | 'status_changed' = 'created';

    const titleMatch = content.match(/Nueva tarea:\s*(.+)/);
    if (titleMatch) {
      title = titleMatch[1].replace(/\*\*/g, '').trim();
      action = 'created';
    }

    const statusChangeMatch = content.match(/(.+?) cambió a:\s*(.+)/);
    if (statusChangeMatch) {
      title = statusChangeMatch[1].replace(/[✅❌⏳🔄📋]\s*\*{0,2}/g, '').trim();
      const newStatus = statusChangeMatch[2].replace(/\*{2}/g, '').trim().toLowerCase().replace(/\s/g, '_');
      if (['pending', 'in_progress', 'completed', 'cancelled'].includes(newStatus)) {
        status = newStatus;
      }
      action = 'status_changed';
    }

    const descMatch = content.match(/^>\s*(.+)/m);
    if (descMatch) description = descMatch[1].replace(/\.\.\.$/, '').trim();

    const statusMatch = content.match(/Estado:\s*(\w[\w\s]*)/);
    if (statusMatch) {
      const s = statusMatch[1].trim().toLowerCase().replace(/\s/g, '_');
      if (['pending', 'in_progress', 'completed', 'cancelled'].includes(s)) status = s;
    }

    const prioMatch = content.match(/Prioridad:\s*(\w+)/i);
    if (prioMatch) {
      const p = prioMatch[1].toLowerCase();
      if (['low', 'medium', 'high', 'urgent'].includes(p)) priority = p;
    }

    const assigneeMatch = content.match(/Asignada a:\s*\*{0,2}(.+?)\*{0,2}/);
    if (assigneeMatch) assigneeName = assigneeMatch[1].trim();
    else if (content.includes('Sin asignar')) assigneeName = null;

    const dueMatch = content.match(/Fecha limite:\s*(.+)/);
    if (dueMatch) {
      const dateStr = dueMatch[1].trim();
      try {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          dueDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        }
      } catch {}
    }

    return {
      taskId: this.message?._id,
      title: title || 'Tarea',
      status,
      priority,
      description,
      assigneeName,
      assigneeAvatar: null,
      dueDate,
      action,
    };
  }

  get title(): string {
    return this.taskData.title || 'Tarea';
  }

  get description(): string {
    return this.taskData.description || '';
  }

  get status(): string {
    return this.taskData.status || 'pending';
  }

  get priority(): string {
    return this.taskData.priority || 'medium';
  }

  get assigneeName(): string {
    return this.taskData.assigneeName || 'Sin asignar';
  }

  get assigneeAvatar(): string {
    return this.taskData.assigneeAvatar || '';
  }

  get dueDate(): string {
    if (!this.taskData.dueDate) return '';
    const d = new Date(this.taskData.dueDate);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  get isOverdue(): boolean {
    if (!this.taskData.dueDate || this.status === 'completed' || this.status === 'cancelled') return false;
    return new Date(this.taskData.dueDate) < new Date();
  }

  get action(): string {
    return this.taskData.action || 'created';
  }

  get statusLabel(): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      in_progress: 'En progreso',
      completed: 'Completada',
      cancelled: 'Cancelada',
    };
    return labels[this.status] || this.status;
  }

  get priorityLabel(): string {
    const labels: Record<string, string> = {
      low: 'Baja',
      medium: 'Media',
      high: 'Alta',
      urgent: 'Urgente',
    };
    return labels[this.priority] || this.priority;
  }

  get statusIcon(): string {
    const icons: Record<string, string> = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌',
    };
    return icons[this.status] || '📋';
  }

  get priorityIcon(): string {
    const icons: Record<string, string> = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      urgent: '🔴',
    };
    return icons[this.priority] || '🟡';
  }

  get timeAgo(): string {
    const createdAt = this.message?.createdAt;
    if (!createdAt) return '';
    const now = new Date();
    const then = new Date(createdAt);
    const diffMs = now.getTime() - then.getTime();
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins}m`;
    if (hours < 24) return `hace ${hours}h`;
    if (days < 7) return `hace ${days}d`;
    return then.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  onNavigate(): void {
    this.openTask.emit(this.taskData.taskId);
    this.router.navigate(['/dashboard'], { queryParams: { view: 'tasks' } });
  }
}
