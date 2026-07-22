import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-thread-renderer',
  templateUrl: './thread-renderer.component.html',
  styleUrls: ['./thread-renderer.component.scss']
})
export class ThreadRendererComponent {
  @Input() message: any;

  get threadTitle(): string {
    return this.message?.threadData?.title || 'Hilo';
  }

  get threadMessage(): string {
    return this.message?.threadData?.initialMessage || '';
  }
}
