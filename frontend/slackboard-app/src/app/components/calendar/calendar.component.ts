import { Component, OnInit } from '@angular/core';
import { CalendarService, CalendarEvent, CalendarResponse } from '../../services/calendar.service';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  events: CalendarEvent[];
  isHoliday: boolean;
  holidayName?: string;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  isAuthenticated = false;
  isLoading = false;
  weekEvents: CalendarEvent[] = [];
  holidays: CalendarEvent[] = [];
  selectedView: 'month' | 'week' = 'month';
  errorMessage = '';
  
  // Calendar view
  currentDate = new Date();
  calendarDays: CalendarDay[] = [];
  monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  
  selectedEvent: CalendarEvent | null = null;
  showCreateModal = false;
  showEditModal = false;
  
  // Formulario de evento
  eventForm = {
    summary: '',
    description: '',
    location: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    allDay: false
  };

  constructor(private calendarService: CalendarService) {}

  ngOnInit(): void {
    this.checkAuthStatus();
  }

  checkAuthStatus(): void {
    this.isLoading = true;
    this.calendarService.getStatus().subscribe({
      next: (status) => {
        this.isAuthenticated = status.authenticated;
        if (this.isAuthenticated) {
          this.loadEvents();
          this.loadHolidays();
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error checking auth status:', error);
        this.errorMessage = 'Error al verificar autenticación';
        this.isLoading = false;
      }
    });
  }

  authorize(): void {
    this.calendarService.getAuthUrl().subscribe({
      next: (response) => {
        window.open(response.authUrl, '_blank');
        setTimeout(() => {
          this.checkAuthStatus();
        }, 5000);
      },
      error: (error) => {
        console.error('Error getting auth URL:', error);
        this.errorMessage = 'Error al obtener URL de autorización';
      }
    });
  }

  loadEvents(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    this.calendarService.getMonthEvents(year, month).subscribe({
      next: (response: CalendarResponse) => {
        this.weekEvents = response.events;
        if (this.selectedView === 'month') {
          this.generateCalendar();
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading events:', error);
        this.errorMessage = 'Error al cargar eventos';
        this.isLoading = false;
      }
    });
  }

  loadHolidays(): void {
    const year = this.currentDate.getFullYear();
    this.calendarService.getHolidays(year).subscribe({
      next: (response) => {
        this.holidays = response.holidays;
        if (this.selectedView === 'month') {
          this.generateCalendar();
        }
      },
      error: (error) => {
        console.error('Error loading holidays:', error);
      }
    });
  }

  generateCalendar(): void {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    
    const firstDayOfWeek = firstDay.getDay();
    const lastDateOfMonth = lastDay.getDate();
    const prevLastDate = prevLastDay.getDate();
    
    this.calendarDays = [];
    
    // Días del mes anterior
    for (let i = firstDayOfWeek; i > 0; i--) {
      const date = new Date(year, month - 1, prevLastDate - i + 1);
      this.calendarDays.push(this.createCalendarDay(date, false));
    }
    
    // Días del mes actual
    for (let i = 1; i <= lastDateOfMonth; i++) {
      const date = new Date(year, month, i);
      this.calendarDays.push(this.createCalendarDay(date, true));
    }
    
    // Días del mes siguiente
    const remainingDays = 42 - this.calendarDays.length;
    for (let i = 1; i <= remainingDays; i++) {
      const date = new Date(year, month + 1, i);
      this.calendarDays.push(this.createCalendarDay(date, false));
    }
  }

  createCalendarDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    const events = this.getEventsForDate(date);
    const holiday = this.getHolidayForDate(date);
    
    return {
      date,
      isCurrentMonth,
      events,
      isHoliday: !!holiday,
      holidayName: holiday?.summary
    };
  }

  getEventsForDate(date: Date): CalendarEvent[] {
    return this.weekEvents.filter(event => {
      const eventDate = new Date(event.start.dateTime || event.start.date || '');
      return eventDate.toDateString() === date.toDateString();
    });
  }

  getHolidayForDate(date: Date): CalendarEvent | undefined {
    return this.holidays.find(holiday => {
      const holidayDate = new Date(holiday.start.date || '');
      return holidayDate.toDateString() === date.toDateString();
    });
  }

  switchView(view: 'month' | 'week'): void {
    this.selectedView = view;
    if (view === 'month') {
      this.generateCalendar();
    }
  }

  previousMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.loadEvents();
    this.loadHolidays();
  }

  nextMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.loadEvents();
    this.loadHolidays();
  }

  goToToday(): void {
    this.currentDate = new Date();
    this.loadEvents();
    this.loadHolidays();
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  getEventUrgency(event: CalendarEvent): 'high' | 'medium' | 'low' {
    const eventDate = new Date(event.start.dateTime || event.start.date || '');
    const now = new Date();
    const hoursUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntil < 2) return 'high';
    if (hoursUntil < 24) return 'medium';
    return 'low';
  }

  getEventColor(event: CalendarEvent): string {
    const urgency = this.getEventUrgency(event);
    switch (urgency) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  }

  selectEvent(event: CalendarEvent): void {
    this.selectedEvent = event;
  }

  closeEventDetail(): void {
    this.selectedEvent = null;
  }

  // 🆕 Abrir modal de crear evento
  openCreateModal(date?: Date): void {
    this.eventForm = {
      summary: '',
      description: '',
      location: '',
      startDate: date ? this.formatDate(date) : this.formatDate(new Date()),
      startTime: '09:00',
      endDate: date ? this.formatDate(date) : this.formatDate(new Date()),
      endTime: '10:00',
      allDay: false
    };
    this.showCreateModal = true;
  }

  // 🆕 Abrir modal de editar evento
  openEditModal(event: CalendarEvent): void {
    const startDate = new Date(event.start.dateTime || event.start.date || '');
    const endDate = new Date(event.end.dateTime || event.end.date || '');
    
    this.eventForm = {
      summary: event.summary,
      description: event.description || '',
      location: event.location || '',
      startDate: this.formatDate(startDate),
      startTime: event.start.dateTime ? this.formatTime(startDate) : '',
      endDate: this.formatDate(endDate),
      endTime: event.end.dateTime ? this.formatTime(endDate) : '',
      allDay: !event.start.dateTime
    };
    this.selectedEvent = event;
    this.showEditModal = true;
  }

  // 🆕 Crear evento
  createEvent(): void {
    if (!this.eventForm.summary) {
      alert('El título del evento es requerido');
      return;
    }

    const startDateTime = this.eventForm.allDay 
      ? this.eventForm.startDate
      : `${this.eventForm.startDate}T${this.eventForm.startTime}:00`;
    
    const endDateTime = this.eventForm.allDay
      ? this.eventForm.endDate
      : `${this.eventForm.endDate}T${this.eventForm.endTime}:00`;

    this.calendarService.createEvent({
      summary: this.eventForm.summary,
      description: this.eventForm.description,
      location: this.eventForm.location,
      startDateTime,
      endDateTime,
      allDay: this.eventForm.allDay
    }).subscribe({
      next: () => {
        this.showCreateModal = false;
        this.loadEvents();
        alert('✅ Evento creado exitosamente');
      },
      error: (error) => {
        console.error('Error creating event:', error);
        alert('❌ Error al crear evento');
      }
    });
  }

  // 🆕 Actualizar evento
  updateEvent(): void {
    if (!this.selectedEvent || !this.eventForm.summary) {
      return;
    }

    const startDateTime = this.eventForm.allDay 
      ? this.eventForm.startDate
      : `${this.eventForm.startDate}T${this.eventForm.startTime}:00`;
    
    const endDateTime = this.eventForm.allDay
      ? this.eventForm.endDate
      : `${this.eventForm.endDate}T${this.eventForm.endTime}:00`;

    this.calendarService.updateEvent(this.selectedEvent.id, {
      summary: this.eventForm.summary,
      description: this.eventForm.description,
      location: this.eventForm.location,
      startDateTime,
      endDateTime,
      allDay: this.eventForm.allDay
    }).subscribe({
      next: () => {
        this.showEditModal = false;
        this.selectedEvent = null;
        this.loadEvents();
        alert('✅ Evento actualizado exitosamente');
      },
      error: (error) => {
        console.error('Error updating event:', error);
        alert('❌ Error al actualizar evento');
      }
    });
  }

  // 🆕 Eliminar evento
  deleteEvent(): void {
    if (!this.selectedEvent) return;

    if (confirm('¿Estás seguro de que quieres eliminar este evento?')) {
      this.calendarService.deleteEvent(this.selectedEvent.id).subscribe({
        next: () => {
          this.showEditModal = false;
          this.selectedEvent = null;
          this.loadEvents();
          alert('✅ Evento eliminado exitosamente');
        },
        error: (error) => {
          console.error('Error deleting event:', error);
          alert('❌ Error al eliminar evento');
        }
      });
    }
  }

  closeModal(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.selectedEvent = null;
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  getEventTime(event: CalendarEvent): string {
    const start = event.start.dateTime || event.start.date;
    if (!start) return '';
    
    const date = new Date(start);
    if (event.start.dateTime) {
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } else {
      return 'Todo el día';
    }
  }

  getEventDate(event: CalendarEvent): string {
    const start = event.start.dateTime || event.start.date;
    if (!start) return '';
    
    const date = new Date(start);
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  revokeAccess(): void {
    if (confirm('¿Estás seguro de que quieres revocar el acceso al calendario?')) {
      this.calendarService.revokeAccess().subscribe({
        next: () => {
          this.isAuthenticated = false;
          this.weekEvents = [];
          this.calendarDays = [];
          alert('Acceso revocado exitosamente');
        },
        error: (error) => {
          console.error('Error revoking access:', error);
          this.errorMessage = 'Error al revocar acceso';
        }
      });
    }
  }

  get currentMonthYear(): string {
    return `${this.monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
  }

  get displayEvents(): CalendarEvent[] {
    return this.weekEvents;
  }
}