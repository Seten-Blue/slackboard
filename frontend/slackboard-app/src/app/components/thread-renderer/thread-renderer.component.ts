import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-thread-renderer',
  templateUrl: './thread-renderer.component.html',
  styleUrls: ['./thread-renderer.component.scss']
})
export class ThreadRendererComponent {
  @Input() message: any;
  @Output() openThread = new EventEmitter<string>();

  get threadTitle(): string {
    return this.message?.threadData?.title || 'Hilo';
  }

  get threadMessage(): string {
    return this.message?.threadData?.initialMessage || '';
  }

  get replyCount(): number {
    return this.message?.threadData?.replyCount || 0;
  }

  get participants(): any[] {
    return this.message?.threadData?.participants || [];
  }

  onOpenThread(): void {
    this.openThread.emit(this.message?._id);
  }
}
