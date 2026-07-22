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
  options: { emoji: string; text: string }[] = [
    { emoji: '', text: '' },
    { emoji: '', text: '' }
  ];
  allowMultiple: boolean = false;
  isAnonymous: boolean = false;
  duration: number = 24;

  showEmojiPicker = false;
  editingOptionIndex = -1;

  durationOptions = [
    { value: 0, label: 'Sin limite' },
    { value: 1, label: '1 hora' },
    { value: 6, label: '6 horas' },
    { value: 12, label: '12 horas' },
    { value: 24, label: '24 horas' },
    { value: 48, label: '2 dias' },
    { value: 72, label: '3 dias' },
    { value: 168, label: '7 dias' },
  ];

  quickEmojis = [
    '👍', '👎', '❤️', '🔥', '⭐', '🎯', '🎮', '💻',
    '🎵', '🎨', '🏀', '⚽', '🍕', '☕', '🚀', '💡',
    '✅', '❌', '📊', '🏆', '🎉', '💪', '🧠', '👀'
  ];

  get isValid(): boolean {
    return this.question.trim().length > 0 &&
           this.options.filter(o => o.text.trim().length > 0).length >= 2;
  }

  addOption() {
    if (this.options.length < 10) {
      this.options.push({ emoji: '', text: '' });
    }
  }

  removeOption(index: number) {
    if (this.options.length > 2) {
      this.options.splice(index, 1);
    }
  }

  openEmojiPicker(index: number, event: Event) {
    event.stopPropagation();
    this.editingOptionIndex = index;
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  pickEmoji(emoji: string) {
    if (this.editingOptionIndex >= 0) {
      this.options[this.editingOptionIndex].emoji = emoji;
    }
    this.showEmojiPicker = false;
    this.editingOptionIndex = -1;
  }

  closeEmojiPicker() {
    this.showEmojiPicker = false;
    this.editingOptionIndex = -1;
  }

  onSubmit() {
    if (!this.isValid) return;
    this.submit.emit({
      question: this.question.trim(),
      options: this.options.filter(o => o.text.trim().length > 0).map(o => ({
        emoji: o.emoji,
        text: o.text.trim()
      })),
      allowMultiple: this.allowMultiple,
      isAnonymous: this.isAnonymous,
      duration: this.duration
    });
    this.resetForm();
  }

  onClose() {
    this.resetForm();
    this.close.emit();
  }

  onBackdropClick(event: Event) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }

  private resetForm() {
    this.question = '';
    this.options = [{ emoji: '', text: '' }, { emoji: '', text: '' }];
    this.allowMultiple = false;
    this.isAnonymous = false;
    this.duration = 24;
    this.showEmojiPicker = false;
    this.editingOptionIndex = -1;
  }
}
