import { Component, Input } from '@angular/core';

/**
 * <app-platform-icon> — pequeno componente reutilizable que dibuja el
 * "logo" de una plataforma (WhatsApp, Slack, Discord, Teams, etc).
 *
 * IMPORTANTE: en vez de reproducir los logos oficiales (que son marcas
 * registradas), esto usa iconos de linea genericos + el color de marca
 * de cada plataforma. Es un enfoque seguro y muy usado en dashboards
 * (Notion, Zapier, etc. hacen lo mismo con integraciones de terceros).
 *
 * Si mas adelante quieren los SVG oficiales, se pueden reemplazar los
 * <svg> de aqui por los que provea cada marca (o la libreria
 * "simple-icons", pensada exactamente para esto).
 */
@Component({
  selector: 'app-platform-icon',
  templateUrl: './platform-icon.component.html',
  styleUrls: ['./platform-icon.component.scss']
})
export class PlatformIconComponent {
  /** id de la plataforma: 'whatsapp' | 'slack' | 'discord' | 'teams' | 'skype' | 'other' */
  @Input() platform: string = 'other';

  /** color de marca en hex, ej: '#25D366' */
  @Input() color: string = '#9CA3AF';

  /** tamano del glifo interno en px */
  @Input() size: number = 18;

  /** si true, dibuja el fondo circular con glow suave */
  @Input() withBadge: boolean = true;
}