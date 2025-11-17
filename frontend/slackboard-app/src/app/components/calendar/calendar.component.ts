import { Component, OnInit } from '@angular/core';
import { 
  CalendarService, 
  CalendarEvent, 
  CalendarResponse, 
  HolidaysResponse,
  AuthStatus,
  AuthUrl,
  CreateEventRequest
} from '../../services/calendar.service';
import { Observable } from 'rxjs';

// Ya no necesitas redefinir estas interfaces, ya están en el servicio
// Solo agrega esta si necesitas un tipo específico para createEvent response
interface CreateEventResponse {
  event: CalendarEvent;
}

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit {
  events: CalendarEvent[] = [];
  holidays: any[] = [];
  isAuthenticated = false;
  loading = false;
  currentView: 'today' | 'week' | 'month' = 'week';

  showCreateModal = false;
  newEvent = {
    summary: '',
    description: '',
    location: '',
    startDateTime: '',
    endDateTime: '',
    allDay: false
  };

  currentDate = new Date();
  currentMonth = this.currentDate.getMonth();
  currentYear = this.currentDate.getFullYear();
  calendarDays: any[] = [];

  constructor(private calendarService: CalendarService) {}

  ngOnInit() {
    this.checkAuth();
    this.generateCalendarDays();
  }

  checkAuth() {
    this.calendarService.getStatus().subscribe({  // Cambiado de checkStatus a getStatus
      next: (response: AuthStatus) => {
        this.isAuthenticated = response.authenticated;
        if (this.isAuthenticated) {
          this.loadEvents();
          this.loadHolidays();
        }
      },
      error: (error: any) => {
        console.error('Error verificando autenticación:', error);
      }
    });
  }

  authorize() {
    this.calendarService.getAuthUrl().subscribe({
      next: (response: AuthUrl) => {
        window.open(response.authUrl, '_blank');
        
        setTimeout(() => {
          alert('Por favor autoriza la aplicación en la ventana que se abrió. Luego recarga esta página.');
        }, 1000);
      },
      error: (error: any) => {
        console.error('Error obteniendo URL de autorización:', error);
      }
    });
  }

  loadEvents() {
    this.loading = true;
    
    let observable: Observable<CalendarResponse>;
    switch (this.currentView) {
      case 'today':
        observable = this.calendarService.getTodayEvents();
        break;
      case 'week':
        observable = this.calendarService.getWeekEvents();
        break;
      case 'month':
        observable = this.calendarService.getMonthEvents(this.currentYear, this.currentMonth);
        break;
    }

    observable.subscribe({
      next: (response: CalendarResponse) => {
        this.events = response.events || [];
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error cargando eventos:', error);
        this.loading = false;
        if (error.status === 401) {
          this.isAuthenticated = false;
        }
      }
    });
  }

  loadHolidays() {
    this.calendarService.getHolidays(this.currentYear).subscribe({
      next: (response: HolidaysResponse) => {
        this.holidays = response.holidays || [];
      },
      error: (error: any) => {
        console.error('Error cargando festivos:', error);
      }
    });
  }

  changeView(view: 'today' | 'week' | 'month') {
    this.currentView = view;
    this.loadEvents();
  }

  openCreateModal() {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    this.newEvent = {
      summary: '',
      description: '',
      location: '',
      startDateTime: this.formatDateTimeLocal(now),
      endDateTime: this.formatDateTimeLocal(end),
      allDay: false
    };
    this.showCreateModal = true;
  }

  createEvent() {
    if (!this.newEvent.summary.trim()) return;

    this.loading = true;
    this.calendarService.createEvent(this.newEvent).subscribe({
      next: (response: CreateEventResponse) => {
        this.events.push(response.event);
        this.showCreateModal = false;
        this.loading = false;
        this.loadEvents();
      },
      error: (error: any) => {
        console.error('Error creando evento:', error);
        this.loading = false;
        alert('Error creando evento: ' + error.error?.message);
      }
    });
  }

  deleteEvent(eventId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar este evento?')) return;

    this.loading = true;
    this.calendarService.deleteEvent(eventId).subscribe({
      next: () => {
        this.events = this.events.filter(e => e.id !== eventId);
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error eliminando evento:', error);
        this.loading = false;
        alert('Error eliminando evento: ' + error.error?.message);
      }
    });
  }

  generateCalendarDays() {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1);
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    this.calendarDays = [];

    const prevMonthDays = startingDayOfWeek;
    const prevMonthLastDay = new Date(this.currentYear, this.currentMonth, 0).getDate();
    for (let i = prevMonthDays - 1; i >= 0; i--) {
      this.calendarDays.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        isToday: false,
        date: new Date(this.currentYear, this.currentMonth - 1, prevMonthLastDay - i)
      });
    }

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.currentYear, this.currentMonth, day);
      this.calendarDays.push({
        day: day,
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
        date: date
      });
    }

    const remainingDays = 42 - this.calendarDays.length;
    for (let day = 1; day <= remainingDays; day++) {
      this.calendarDays.push({
        day: day,
        isCurrentMonth: false,
        isToday: false,
        date: new Date(this.currentYear, this.currentMonth + 1, day)
      });
    }
  }

  previousMonth() {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.generateCalendarDays();
    if (this.currentView === 'month') {
      this.loadEvents();
    }
  }

  nextMonth() {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.generateCalendarDays();
    if (this.currentView === 'month') {
      this.loadEvents();
    }
  }

  getEventsForDay(date: Date): CalendarEvent[] {
    return this.events.filter(event => {
      const eventDate = new Date(event.start.dateTime || event.start.date || '');
      return eventDate.toDateString() === date.toDateString();
    });
  }

  isHoliday(date: Date): boolean {
    return this.holidays.some(holiday => {
      const holidayDate = new Date(holiday.start.date || '');
      return holidayDate.toDateString() === date.toDateString();
    });
  }

  getHolidayName(date: Date): string {
    const holiday = this.holidays.find(h => {
      const holidayDate = new Date(h.start.date || '');
      return holidayDate.toDateString() === date.toDateString();
    });
    return holiday?.summary || '';
  }

  formatDateTime(dateTime: any): string {
    if (!dateTime) return '';
    const date = new Date(dateTime.dateTime || dateTime.date);
    return date.toLocaleString('es-ES', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: dateTime.dateTime ? '2-digit' : undefined,
      minute: dateTime.dateTime ? '2-digit' : undefined
    });
  }

  formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  getMonthName(): string {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return months[this.currentMonth];
  }

  closeModal() {
    this.showCreateModal = false;
  }
}