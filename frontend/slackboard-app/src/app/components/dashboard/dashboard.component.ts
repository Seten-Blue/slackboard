import { Component, OnInit } from '@angular/core';
import { AnalyticsService } from '../../services/analytics.service';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  stats: any = null;
  loading = true;
  aiQuestion = '';
  aiResponse = '';

  channelChartData: ChartConfiguration['data'] | null = null;
  peakHoursChartData: ChartConfiguration['data'] | null = null;
  
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0
        }
      }
    }
  };

  constructor(private analyticsService: AnalyticsService) {}

  ngOnInit() {
    this.loadStats();
  }

  loadStats() {
    this.loading = true;
    this.analyticsService.getGeneralStats().subscribe({
      next: (response) => {
        this.stats = response.data;
        this.loading = false;
        this.prepareChartData();
      },
      error: (error) => {
        console.error('Error cargando estadísticas:', error);
        this.loading = false;
      }
    });
  }

  prepareChartData() {
    if (!this.stats) return;

    // Gráfica de mensajes por canal
    if (this.stats.messagesPerChannel && this.stats.messagesPerChannel.length > 0) {
      this.channelChartData = {
        labels: this.stats.messagesPerChannel.map((c: any) => c.channelName),
        datasets: [{
          label: 'Mensajes',
          data: this.stats.messagesPerChannel.map((c: any) => c.count),
          backgroundColor: [
            'rgba(139, 92, 246, 0.8)',
            'rgba(59, 130, 246, 0.8)',
            'rgba(16, 185, 129, 0.8)',
            'rgba(245, 158, 11, 0.8)',
            'rgba(239, 68, 68, 0.8)'
          ],
          borderColor: [
            'rgba(139, 92, 246, 1)',
            'rgba(59, 130, 246, 1)',
            'rgba(16, 185, 129, 1)',
            'rgba(245, 158, 11, 1)',
            'rgba(239, 68, 68, 1)'
          ],
          borderWidth: 2
        }]
      };
    }

    // Gráfica de horas pico
    if (this.stats.peakHours && this.stats.peakHours.length > 0) {
      // Crear un array de 24 horas con valores por defecto
      const hourlyData = new Array(24).fill(0);
      
      // Llenar con los datos reales
      this.stats.peakHours.forEach((peak: any) => {
        hourlyData[peak.hour] = peak.messageCount;
      });

      this.peakHoursChartData = {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Mensajes por hora',
          data: hourlyData,
          borderColor: 'rgba(139, 92, 246, 1)',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 3,
          tension: 0.4,
          fill: true
        }]
      };
    }
  }

  askAI() {
    if (!this.aiQuestion.trim()) return;

    // IA simple basada en reglas (puedes mejorarla con OpenAI después)
    const question = this.aiQuestion.toLowerCase();

    if (question.includes('canal') && (question.includes('activo') || question.includes('popular'))) {
      const topChannel = this.stats.messagesPerChannel[0];
      this.aiResponse = `El canal más activo es #${topChannel.channelName} con ${topChannel.count} mensajes.`;
    } else if (question.includes('usuario') && question.includes('activo')) {
      const topUser = this.stats.topUsers[0];
      this.aiResponse = `El usuario más activo es ${topUser.username} con ${topUser.messageCount} mensajes.`;
    } else if (question.includes('mensaje') && question.includes('total')) {
      this.aiResponse = `Hay un total de ${this.stats.overview.totalMessages} mensajes en el workspace.`;
    } else if (question.includes('hora') && question.includes('pico')) {
      const peakHour = this.stats.peakHours.reduce((max: any, hour: any) => 
        hour.messageCount > (max.messageCount || 0) ? hour : max, {});
      this.aiResponse = `La hora pico es a las ${peakHour.hour}:00 con ${peakHour.messageCount} mensajes.`;
    } else if (question.includes('usuarios') && question.includes('línea')) {
      this.aiResponse = `Actualmente hay ${this.stats.overview.activeUsers} usuarios en línea.`;
    } else {
      this.aiResponse = `📊 Datos clave: ${this.stats.overview.totalUsers} usuarios, ${this.stats.overview.totalChannels} canales, ${this.stats.overview.totalMessages} mensajes totales. Pregunta sobre canales, usuarios o estadísticas específicas.`;
    }

    // Limpiar la pregunta después de un momento
    setTimeout(() => {
      this.aiQuestion = '';
    }, 100);
  }
}