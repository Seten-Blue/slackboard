
import { Component, OnInit } from '@angular/core';
import { TrelloService } from '../../services/trello';

@Component({
  selector: 'app-trello-board',
  templateUrl: './trello-board.component.html',
  styleUrls: ['./trello-board.component.scss']
})
export class TrelloBoardComponent implements OnInit {
  // --- NUEVO: Avance por miembro ---
  boardCards: any[] = [];
  isLoadingCards = false;
  cardsError = '';

  loadBoardCards(boardId: string) {
    this.isLoadingCards = true;
    this.cardsError = '';
    this.trelloService.getBoardCards(boardId).subscribe({
      next: (res: any) => {
        this.boardCards = res.data || [];
        this.isLoadingCards = false;
      },
      error: (err: any) => {
        this.cardsError = 'Error cargando tarjetas del tablero';
        this.isLoadingCards = false;
      }
    });
  }

  // Lógica para resumen de avance por miembro
  getMemberProgress() {
    if (!this.boardCards || this.boardCards.length === 0) return [];
    interface Progress {
      id: string;
      name: string;
      username?: string;
      avatarUrl?: string;
      email?: string;
      done: number;
      doing: number;
      todo: number;
      total: number;
      percent: number;
      [key: string]: any;
    }
    const progress: { [member: string]: Progress } = {};
    this.boardCards.forEach((card: any) => {
      const members = card.members && card.members.length ? card.members : [{ fullName: 'Sin asignar', id: 'none' }];
      let estado = 'todo';
      if (card.closed || card.dueComplete) estado = 'done';
      else if (card.due || card.start) estado = 'doing';
      members.forEach((m: any) => {
        if (!progress[m.id]) {
          progress[m.id] = {
            id: m.id,
            name: m.fullName || m.username || 'Sin asignar',
            username: m.username || '',
            avatarUrl: m.avatarUrl || m.avatarHash ? `https://trello-members.s3.amazonaws.com/${m.id}/${m.avatarHash}/170.png` : '',
            email: m.email || '',
            done: 0, doing: 0, todo: 0, total: 0, percent: 0
          };
        }
        progress[m.id][estado]++;
        progress[m.id].total++;
      });
    });
    // Calcular porcentaje y devolver ordenado
    Object.values(progress).forEach((p: any) => {
      p.percent = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    });
    return Object.values(progress).sort((a, b) => b.percent - a.percent);
  }

  // Devuelve la clase de color para la barra de avance
  getProgressColor(percent: number): string {
    if (percent >= 90) return 'progress-bar-green';
    if (percent > 69) return 'progress-bar-orange';
    if (percent < 30) return 'progress-bar-red';
    if (percent < 51) return 'progress-bar-yellow';
    return 'progress-bar-default';
  }
  boards: any[] = [];
  allBoards: any[] = []; // Incluye todos los tableros, incluso los de pruebas
  isLoading = false;
  errorMsg = '';

  // Devuelve una etiqueta legible para el nivel de permiso de Trello
  getPermissionLabel(level: string): string {
    switch (level) {
      case 'private': return 'Privado';
      case 'org': return 'Organización';
      case 'public': return 'Público';
      default: return level || 'Desconocido';
    }
  }

  constructor(private trelloService: TrelloService) {}

  ngOnInit(): void {
    this.loadBoards();
  }

  loadBoards(): void {
    this.isLoading = true;
    this.errorMsg = '';
    this.trelloService.getBoards().subscribe({
      next: (res: any) => {
        this.allBoards = res.data || [];
        this.boards = this.allBoards; // Mostrar todos los tableros
        this.isLoading = false;
      },
      error: (err: any) => {
        this.errorMsg = 'Error cargando tableros de Trello';
        this.isLoading = false;
      }
    });
  }

  // Detecta si un board es de pruebas (por nombre o id)
  isTestBoard(board: any): boolean {
    // Mejor filtro: ignora espacios, mayúsculas y caracteres especiales
    const testNames = ['prueba', 'test', 'tablero de pruebas', 'demo'];
    const normalize = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const nameNorm = normalize(board.name);
    // Coincidencia exacta o parcial
    if (testNames.some(t => nameNorm.includes(normalize(t)))) return true;
    // Si tienes el id del tablero de pruebas, agrégalo aquí:
    const testBoardIds = ['tablerodepruebasid', 'idprueba123']; // <-- pon aquí el id real si lo sabes
    if (testBoardIds.includes((board.id || '').toLowerCase())) return true;
    return false;
  }

  // Devuelve un color para la barra lateral de cada board (puedes personalizar la paleta)
  getBoardColor(board: any): string {
    // Si el board tiene color, úsalo; si no, asigna uno por hash del id
    const palette = [
      '#60a5fa', // azul claro
      '#38bdf8', // celeste
      '#818cf8', // violeta
      '#f472b6', // rosa
      '#fbbf24', // amarillo
      '#34d399', // verde
      '#f87171', // rojo
      '#a3e635', // lima
      '#facc15', // dorado
      '#f472b6'  // rosa
    ];
    if (board.prefs?.backgroundColor) return board.prefs.backgroundColor;
    let hash = 0;
    for (let i = 0; i < board.id.length; i++) {
      hash = board.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  }

  // Devuelve tiempo relativo (ej: "hace 2 días")
  getRelativeTime(dateStr: string): string {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;
    if (diff < 60) return 'hace unos segundos';
    if (diff < 3600) return `hace ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff/3600)} h`;
    if (diff < 2592000) return `hace ${Math.floor(diff/86400)} días`;
    return date.toLocaleDateString();
  }

  // --- NUEVO: Tabla de actividad ---
  boardActions: any[] = [];
  isLoadingActions = false;
  actionsError = '';
  selectedBoardId: string | null = null;

  loadBoardActions(boardId: string) {
    this.selectedBoardId = boardId;
    this.isLoadingActions = true;
    this.actionsError = '';
  this.loadBoardCards(boardId); // Cargar tarjetas para la tabla de avance
    this.trelloService.getBoardActions(boardId, 20).subscribe({
      next: (res: any) => {
        this.boardActions = res.data || [];
        this.isLoadingActions = false;
      },
      error: (err: any) => {
        this.actionsError = 'Error cargando actividad del tablero';
        this.isLoadingActions = false;
      }
    });
  }
}
