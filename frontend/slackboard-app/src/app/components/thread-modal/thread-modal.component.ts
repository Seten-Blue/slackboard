import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-thread-modal',
  templateUrl: './thread-modal.component.html',
  styleUrls: ['./thread-modal.component.scss']
})
export class ThreadModalComponent {
  @Input() isOpen = false;
  @Input() channelName = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<any>();

  title = '';
  initialMessage = '';

  get canSubmit(): boolean {
    return this.title.trim().length > 0;
  }

  onSubmit(): void {
    if (!this.canSubmit) return;
    this.submit.emit({ title: this.title.trim(), initialMessage: this.initialMessage.trim() });
    this.title = '';
    this.initialMessage = '';
    this.close.emit();
  }

  onClose(): void {
    this.title = '';
    this.initialMessage = '';
    this.close.emit();
  }
}
