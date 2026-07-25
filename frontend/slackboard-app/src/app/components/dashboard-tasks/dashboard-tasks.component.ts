import { Component, OnInit, OnDestroy } from '@angular/core';
import { TasksService } from '../../services/tasks.service';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard-tasks',
  templateUrl: './dashboard-tasks.component.html',
  styleUrls: ['./dashboard-tasks.component.scss']
})
export class DashboardTasksComponent implements OnInit, OnDestroy {
  tasks: any[] = [];
  stats: any = null;
  loading = true;
  showCreateModal = false;
  showDetailModal = false;
  selectedTask: any = null;
  activeTab: 'board' | 'list' | 'stats' = 'board';

  filterStatus = '';
  filterPriority = '';
  filterAssignee = '';
  allUsers: any[] = [];

  newTask = { title: '', description: '', assignee: '', priority: 'medium', dueDate: '', estimatedHours: 0, tags: '', channel: '' };
  creating = false;
  channels: any[] = [];
  channelMembers: any[] = [];

  get pendingTasks() { return this.tasks.filter(t => t.status === 'pending'); }
  get inProgressTasks() { return this.tasks.filter(t => t.status === 'in_progress'); }
  get completedTasks() { return this.tasks.filter(t => t.status === 'completed'); }
  get cancelledTasks() { return this.tasks.filter(t => t.status === 'cancelled'); }

  runningTimers: Record<string, boolean> = {};
  taskPermissions: any = null;
  timerInterval: any = null;
  elapsedTime: string = '00:00:00';
  timerExceeded = false;
  timerStartedAt: Date | null = null;
  liveTrackedMinutes: number = 0;

  priorityChart: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: ['Urgente', 'Alta', 'Media', 'Baja'],
      datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#f87168', '#fbbf24', '#8b7cf6', 'rgba(255,255,255,0.15)'] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: 'rgba(255,255,255,0.5)', padding: 12 } }
      }
    }
  };

  weeklyChart: ChartConfiguration<'line'> = {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        data: [],
        label: 'Completadas',
        borderColor: '#8b7cf6',
        backgroundColor: 'rgba(139,124,246,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: '#8b7cf6'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 }, color: 'rgba(255,255,255,0.3)' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.3)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  };

  workloadChart: ChartConfiguration<'bar'> = {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        data: [],
        label: 'Tareas',
        backgroundColor: 'rgba(139,124,246,0.6)',
        borderColor: '#8b7cf6',
        borderWidth: 1,
        borderRadius: 4,
        barThickness: 20
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.3)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } }, grid: { display: false } }
      }
    }
  };

  hoursChart: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: ['Rastreado', 'Restante'],
      datasets: [{ data: [0, 0], backgroundColor: ['#8b7cf6', 'rgba(255,255,255,0.06)'] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, color: 'rgba(255,255,255,0.5)', padding: 12 } }
      }
    }
  };

  constructor(private tasksService: TasksService, public authService: AuthService, private chatService: ChatService) {}

  ngOnInit() { this.loadTasks(); this.loadStats(); this.loadChannels(); }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  loadChannels() {
    this.chatService.getChannels().subscribe({
      next: (res) => {
        this.channels = res.data || res || [];
        this.collectAllUsers();
      }
    });
  }

  onChannelChange(channelId: string) {
    if (!channelId) {
      this.channelMembers = [];
      this.newTask.assignee = '';
      return;
    }
    const ch = this.channels.find(c => c._id === channelId);
    this.channelMembers = ch?.members || [];
    this.newTask.assignee = '';
  }

  collectAllUsers() {
    const userMap = new Map<string, any>();
    for (const ch of this.channels) {
      for (const m of ch.members || []) {
        if (m._id) userMap.set(m._id, m);
      }
    }
    this.allUsers = Array.from(userMap.values());
  }

  loadTasks() {
    this.loading = true;
    const params: any = {};
    if (this.filterStatus) params.status = this.filterStatus;
    if (this.filterPriority) params.priority = this.filterPriority;
    if (this.filterAssignee) params.assignee = this.filterAssignee;
    this.tasksService.getTasks(params).subscribe({
      next: (res) => {
        this.tasks = res.data || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Error cargando tareas:', err);
        this.loading = false;
      }
    });
  }

  loadStats() {
    this.tasksService.getStats().subscribe({
      next: (res) => { this.stats = res.data; this.buildStatsCharts(); }
    });
  }

  buildStatsCharts() {
    if (!this.stats) return;

    if (this.stats.byPriority) {
      const p = this.stats.byPriority;
      this.priorityChart = {
        ...this.priorityChart,
        data: {
          ...this.priorityChart.data,
          datasets: [{ ...this.priorityChart.data.datasets[0], data: [p.urgent || 0, p.high || 0, p.medium || 0, p.low || 0] }]
        }
      };
    }

    if (this.stats.completedPerWeek?.length) {
      const labels = this.stats.completedPerWeek.map((d: any) => new Date(d.date).toLocaleDateString('es', { day: '2-digit', month: 'short' }));
      this.weeklyChart = {
        ...this.weeklyChart,
        data: {
          labels,
          datasets: [{ ...this.weeklyChart.data.datasets[0], data: this.stats.completedPerWeek.map((d: any) => d.count) }]
        }
      };
    }

    if (this.stats.workload?.length) {
      this.workloadChart = {
        ...this.workloadChart,
        data: {
          labels: this.stats.workload.map((w: any) => w.assignee || 'Sin asignar'),
          datasets: [{ ...this.workloadChart.data.datasets[0], data: this.stats.workload.map((w: any) => w.count) }]
        }
      };
    }

    if (this.stats.totalEstimatedHours || this.stats.totalTrackedHours) {
      const tracked = this.stats.totalTrackedHours || 0;
      const estimated = this.stats.totalEstimatedHours || 0;
      const remaining = Math.max(0, estimated - tracked);
      this.hoursChart = {
        ...this.hoursChart,
        data: {
          ...this.hoursChart.data,
          datasets: [{ ...this.hoursChart.data.datasets[0], data: [tracked, remaining] }]
        }
      };
    }
  }

  createTask() {
    if (!this.newTask.title) return;
    this.creating = true;
    const payload = { ...this.newTask, tags: this.newTask.tags ? this.newTask.tags.split(',').map(t => t.trim()) : [] };
    this.tasksService.createTask(payload).subscribe({
      next: (res) => { this.tasks.unshift(res.data); this.showCreateModal = false; this.creating = false; this.resetForm(); },
      error: () => { this.creating = false; }
    });
  }

  viewTask(task: any) {
    this.selectedTask = { ...task };
    this.showDetailModal = true;
    this.taskPermissions = null;
    this.timerExceeded = false;
    this.elapsedTime = '00:00:00';
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.tasksService.getTask(task._id).subscribe({
      next: (res) => {
        this.selectedTask = res.data;
        this.tasksService.getPermissions(task._id).subscribe({
          next: (pres) => { this.taskPermissions = pres.data; }
        });
        this.checkRunningTimer();
      }
    });
  }

  checkRunningTimer() {
    if (!this.selectedTask?.timeEntries?.length) return;
        const running = this.selectedTask.timeEntries.find((e: any) => !e.end && e.user?._id === this.authService.currentUser?._id);
    if (running) {
      this.runningTimers[this.selectedTask._id] = true;
      this.timerStartedAt = new Date(running.start);
      this.startTimerCountdown();
    }
  }

  startTimerCountdown() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.timerStartedAt) return;
      const now = new Date();
      const elapsed = now.getTime() - this.timerStartedAt.getTime();
      const hrs = Math.floor(elapsed / 3600000);
      const mins = Math.floor((elapsed % 3600000) / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      this.elapsedTime = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.liveTrackedMinutes = this.totalTrackedMinutes(this.selectedTask) + elapsed / 60000;

      if (this.selectedTask?.estimatedHours && elapsed > this.selectedTask.estimatedHours * 3600000) {
        this.timerExceeded = true;
      }
    }, 1000);
  }

  changeStatus(taskId: string, status: string) {
    this.tasksService.updateStatus(taskId, status).subscribe({
      next: (res) => {
        const updated = res.data;
        const idx = this.tasks.findIndex(t => t._id === taskId);
        if (idx !== -1) this.tasks[idx] = { ...this.tasks[idx], status, completedAt: updated?.completedAt || (status === 'completed' ? new Date().toISOString() : null), actualHours: updated?.actualHours };
        if (this.selectedTask?._id === taskId) {
          this.selectedTask = { ...this.selectedTask, ...updated };
          if (status === 'in_progress') {
            this.checkRunningTimer();
          }
          if (status === 'completed') {
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.runningTimers[taskId] = false;
            this.timerStartedAt = null;
            this.elapsedTime = '00:00:00';
          }
          if (status === 'cancelled' || status === 'pending') {
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.runningTimers[taskId] = false;
            this.timerStartedAt = null;
          }
        }
      }
    });
  }

  toggleTimer(taskId: string) {
    const action = this.runningTimers[taskId] ? 'stop' : 'start';
    this.tasksService.addTimeEntry(taskId, { action }).subscribe({
      next: () => {
        this.runningTimers[taskId] = !this.runningTimers[taskId];
        if (action === 'start') {
          this.timerStartedAt = new Date();
          this.timerExceeded = false;
          this.startTimerCountdown();
          const idx = this.tasks.findIndex(t => t._id === taskId);
          if (idx !== -1) this.tasks[idx] = { ...this.tasks[idx], status: 'in_progress' };
          if (this.selectedTask?._id === taskId) this.selectedTask = { ...this.selectedTask, status: 'in_progress' };
        } else {
          if (this.timerInterval) clearInterval(this.timerInterval);
          this.timerStartedAt = null;
          this.elapsedTime = '00:00:00';
          this.timerExceeded = false;
          this.tasksService.getTask(taskId).subscribe({
            next: (res) => {
              if (this.selectedTask?._id === taskId) this.selectedTask = res.data;
              const idx = this.tasks.findIndex(t => t._id === taskId);
              if (idx !== -1) this.tasks[idx] = { ...this.tasks[idx], actualHours: res.data.actualHours };
            }
          });
        }
      }
    });
  }

  addComment() {
    if (!this.selectedTask || !this.selectedTask._newComment) return;
    const commentText = this.selectedTask._newComment;
    this.selectedTask._newComment = '';
    this.tasksService.addComment(this.selectedTask._id, commentText).subscribe({
      next: (res) => {
        this.selectedTask.comments = res.data || this.selectedTask.comments;
      },
      error: () => { this.selectedTask._newComment = commentText; }
    });
  }

  addSubtask() {
    if (!this.selectedTask || !this.selectedTask._newSubtask) return;
    const title = this.selectedTask._newSubtask;
    this.selectedTask._newSubtask = '';
    this.tasksService.addSubtask(this.selectedTask._id, title).subscribe({
      next: (res) => {
        if (Array.isArray(res.data)) {
          this.selectedTask.subtasks = res.data;
        }
      },
      error: () => { this.selectedTask._newSubtask = title; }
    });
  }

  toggleSubtask(index: number) {
    if (!this.selectedTask) return;
    this.tasksService.toggleSubtask(this.selectedTask._id, index).subscribe({
      next: (res) => { this.selectedTask.subtasks = res.data?.subtasks || this.selectedTask.subtasks; }
    });
  }

  deleteTask(id: string) {
    if (!confirm('Eliminar esta tarea?')) return;
    this.tasksService.deleteTask(id).subscribe({
      next: () => { this.tasks = this.tasks.filter(t => t._id !== id); this.showDetailModal = false; }
    });
  }

  private resetForm() {
    this.newTask = { title: '', description: '', assignee: '', priority: 'medium', dueDate: '', estimatedHours: 0, tags: '', channel: '' };
    this.channelMembers = [];
  }

  priorityColor(p: string): string {
    return p === 'urgent' ? 'text-red-400 bg-red-400/10 border-red-400/20' : p === 'high' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : p === 'medium' ? 'text-signal bg-signal/10 border-signal/20' : 'text-white/40 bg-white/[0.06] border-white/10';
  }

  statusColor(s: string): string {
    return s === 'completed' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : s === 'in_progress' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' : s === 'cancelled' ? 'text-white/30 bg-white/[0.04] border-white/10' : 'text-amber-400 bg-amber-400/10 border-amber-400/20';
  }

  priorityLabel(p: string): string {
    return { urgent: 'Urgente', high: 'Alta', medium: 'Media', low: 'Baja' }[p] || p;
  }

  statusLabel(s: string): string {
    return { pending: 'Pendiente', in_progress: 'En progreso', completed: 'Completada', cancelled: 'Cancelada' }[s] || s;
  }

  isOverdue(task: any): boolean {
    return task.dueDate && task.status !== 'completed' && task.status !== 'cancelled' && new Date(task.dueDate) < new Date();
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  formatHours(h: number): string {
    if (!h) return '0h';
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }

  subtaskProgress(task: any): number {
    if (!task.subtasks?.length) return 0;
    return Math.round((task.subtasks.filter((s: any) => s.completed).length / task.subtasks.length) * 100);
  }

  totalTrackedMinutes(task: any): number {
    if (!task.timeEntries?.length) return 0;
    return task.timeEntries.reduce((sum: number, e: any) => {
      if (e.start && e.end) {
        return sum + (new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000;
      }
      if (e.start && !e.end) {
        return sum + (Date.now() - new Date(e.start).getTime()) / 60000;
      }
      return sum;
    }, 0);
  }

  closeAll() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.showCreateModal = false;
    this.showDetailModal = false;
    this.selectedTask = null;
    this.taskPermissions = null;
  }

  abs(val: number): number {
    return Math.abs(val);
  }
}
