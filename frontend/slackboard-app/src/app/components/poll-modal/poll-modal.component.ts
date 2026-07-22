import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-poll-modal',
  templateUrl: './poll-modal.component.html',
  styleUrls: ['./poll-modal.component.scss']
})
export class PollModalComponent {
  @Input() isOpen: boolean = false;
  @Input() channelName: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<any>();

  question: string = '';
  options: string[] = ['', ''];
  allowMultiple: boolean = false;
  isAnonymous: boolean = false;

  addOption(): void {
    if (this.options.length < 10) {
      this.options.push('');
    }
  }

  removeOption(index: number): void {
    if (this.options.length > 2) {
      this.options.splice(index, 1);
    }
  }

  get isValid(): boolean {
    return this.question.trim().length > 0 && this.options.filter(o => o.trim().length > 0).length >= 2;
  }

  onSubmit(): void {
    if (!this.isValid) return;
    this.submit.emit({
      question: this.question.trim(),
      options: this.options.filter(o => o.trim().length > 0).map(o => o.trim()),
      allowMultiple: this.allowMultiple,
      isAnonymous: this.isAnonymous
    });
    this.resetForm();
  }

  onClose(): void {
    this.resetForm();
    this.close.emit();
  }

  private resetForm(): void {
    this.question = '';
    this.options = ['', ''];
    this.allowMultiple = false;
    this.isAnonymous = false;
  }
}
