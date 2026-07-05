const TRELLO_API_BASE = 'https://api.trello.com/1';

class TrelloService {
  private key: string;
  private token: string;

  constructor() {
    this.key = (process.env.TRELLO_API_KEY || '').trim();
    this.token = (process.env.TRELLO_TOKEN || '').trim();

    if (!this.key || !this.token) {
      console.warn('⚠️  TRELLO_API_KEY o TRELLO_API_TOKEN no configurados. La integración con Trello no funcionará.');
    } else {
      console.log('✅ Trello configurado');
    }
  }

  isConfigured(): boolean {
    return !!this.key && !!this.token;
  }

  private authParams(): string {
    return `key=${this.key}&token=${this.token}`;
  }

  private async request(path: string, options: any = {}): Promise<any> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${TRELLO_API_BASE}${path}${separator}${this.authParams()}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Trello API error (${response.status}): ${errorText}`);
    }

    // Algunas respuestas de Trello (como archivar) vienen sin body útil
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // Obtener todos los tableros del usuario
  async getBoards(): Promise<any[]> {
    return this.request('/members/me/boards?fields=id,name,desc,url,closed');
  }

  // Obtener las listas de un tablero
  async getLists(boardId: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/lists?fields=id,name,pos`);
  }

  // Obtener las tarjetas de un tablero (se agrupan por lista en el frontend)
  async getCardsByBoard(boardId: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/cards?fields=id,name,desc,idList,pos,due,dueComplete,labels,closed`);
  }

  // Crear una tarjeta nueva en una lista
  async createCard(listId: string, name: string, desc?: string): Promise<any> {
    const params = new URLSearchParams({
      idList: listId,
      name,
      ...(desc ? { desc } : {}),
    });
    return this.request(`/cards?${params.toString()}`, { method: 'POST' });
  }

  // Actualizar nombre/descripción de una tarjeta
  async updateCard(cardId: string, data: { name?: string; desc?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (data.name !== undefined) params.set('name', data.name);
    if (data.desc !== undefined) params.set('desc', data.desc);
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' });
  }

  // Mover una tarjeta a otra lista (o reordenar)
  async moveCard(cardId: string, listId: string, pos?: string | number): Promise<any> {
    const params = new URLSearchParams({ idList: listId });
    if (pos !== undefined) params.set('pos', pos.toString());
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' });
  }

  // Archivar tarjeta — el equivalente Trello de "abandonar" en vez de destruir
  async archiveCard(cardId: string): Promise<any> {
    return this.request(`/cards/${cardId}?closed=true`, { method: 'PUT' });
  }

  // Crear una lista nueva en un tablero
  async createList(boardId: string, name: string): Promise<any> {
    const params = new URLSearchParams({ idBoard: boardId, name });
    return this.request(`/lists?${params.toString()}`, { method: 'POST' });
  }
}

export default new TrelloService();