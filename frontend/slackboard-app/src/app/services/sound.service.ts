import { Injectable } from '@angular/core';

export type NotificationSoundType =
  | 'message'
  | 'threadReply'
  | 'poll'
  | 'friendRequest'
  | 'friendAccepted'
  | 'survey'
  | 'trello';

interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const PROFILES: Record<NotificationSoundType, Note[]> = {
  // Mensaje nuevo: doble "pop" corto
  message: [
    { freq: 523, at: 0, dur: 0.09 },
    { freq: 783, at: 0.13, dur: 0.12 },
  ],
  // Respuesta en hilo: ping suave ascendente
  threadReply: [
    { freq: 392, at: 0, dur: 0.12 },
    { freq: 523, at: 0.17, dur: 0.16 },
  ],
  // Voto de encuesta: blip agudo
  poll: [
    { freq: 880, at: 0, dur: 0.08 },
    { freq: 1109, at: 0.11, dur: 0.12 },
  ],
  // Solicitud de amistad: tres notas ascendentes
  friendRequest: [
    { freq: 659, at: 0, dur: 0.14 },
    { freq: 784, at: 0.16, dur: 0.14 },
    { freq: 988, at: 0.32, dur: 0.22 },
  ],
  // Amistad aceptada: acorde alegre
  friendAccepted: [
    { freq: 523, at: 0, dur: 0.12 },
    { freq: 784, at: 0.18, dur: 0.25 },
  ],
  // Nueva encuesta: campanada triple
  survey: [
    { freq: 660, at: 0, dur: 0.12 },
    { freq: 880, at: 0.12, dur: 0.12 },
    { freq: 990, at: 0.24, dur: 0.24 },
  ],
  // Cambio en Trello: "ding-dong" doble campanada profunda
  trello: [
    { freq: 494, at: 0, dur: 0.18, type: 'sine', gain: 0.14 },
    { freq: 659, at: 0.22, dur: 0.18, type: 'sine', gain: 0.14 },
    { freq: 494, at: 0.46, dur: 0.22, type: 'sine', gain: 0.12 },
  ],
};

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private ctx: AudioContext | null = null;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('slackboard-sounds-muted') === '1';
    } catch {
      this.muted = false;
    }
    // "Desbloquea" el AudioContext apenas el usuario interactua con la app
    const unlock = () => {
      this.ensureContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    try {
      localStorage.setItem('slackboard-sounds-muted', value ? '1' : '0');
    } catch {
      // ignorar
    }
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  play(type: NotificationSoundType = 'message'): void {
    if (this.muted) return;
    const notes = PROFILES[type];
    if (!notes?.length) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + 0.02;
      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type || 'sine';
        osc.frequency.value = note.freq;
        const peak = note.gain ?? 0.12;
        gain.gain.setValueAtTime(0.0001, t0 + note.at);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + note.at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0 + note.at);
        osc.stop(t0 + note.at + note.dur + 0.05);
      }
    } catch (error) {
      console.error('No se pudo reproducir el sonido:', error);
    }
  }

  private ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AC) return null;
        this.ctx = new AC();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }
}