const TRELLO_API_BASE = 'https://api.trello.com/1';

class TrelloService {
  private key: string;
  private token: string;

  constructor() {
    this.key = (process.env.TRELLO_API_KEY || '').trim();
    this.token = (process.env.TRELLO_TOKEN || '').trim();

    if (!this.key || !this.token) {
      console.warn('⚠️  TRELLO_API_KEY o TRELLO_TOKEN no configurados. La integracion con Trello no funcionara.');
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

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // ---------- Tableros ----------

  async getBoards(): Promise<any[]> {
    return this.request('/members/me/boards?fields=id,name,desc,url,closed');
  }

  // ---------- Listas ----------

  async getLists(boardId: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/lists?fields=id,name,pos`);
  }

  async createList(boardId: string, name: string): Promise<any> {
    const params = new URLSearchParams({ idBoard: boardId, name });
    return this.request(`/lists?${params.toString()}`, { method: 'POST' });
  }

  // ← NUEVO: archivar una lista (equivalente a "quitarla" sin destruir sus tarjetas)
  async archiveList(listId: string): Promise<any> {
    return this.request(`/lists/${listId}?closed=true`, { method: 'PUT' });
  }

  // ---------- Tarjetas ----------

  async getCardsByBoard(boardId: string): Promise<any[]> {
    // ← CAMBIO: se agrego 'badges' para traer contador de adjuntos/comentarios/checklist sin llamadas extra
    return this.request(`/boards/${boardId}/cards?fields=id,name,desc,idList,pos,due,dueComplete,labels,closed,badges`);
  }

  async createCard(listId: string, name: string, desc?: string): Promise<any> {
    const params = new URLSearchParams({
      idList: listId,
      name,
      ...(desc ? { desc } : {}),
    });
    return this.request(`/cards?${params.toString()}`, { method: 'POST' });
  }

  // ← CAMBIO: ahora acepta tambien due y dueComplete
  async updateCard(cardId: string, data: { name?: string; desc?: string; due?: string | null; dueComplete?: boolean }): Promise<any> {
    const params = new URLSearchParams();
    if (data.name !== undefined) params.set('name', data.name);
    if (data.desc !== undefined) params.set('desc', data.desc);
    if (data.due !== undefined) params.set('due', data.due === null ? 'null' : data.due);
    if (data.dueComplete !== undefined) params.set('dueComplete', String(data.dueComplete));
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' });
  }

  async moveCard(cardId: string, listId: string, pos?: string | number): Promise<any> {
    const params = new URLSearchParams({ idList: listId });
    if (pos !== undefined) params.set('pos', pos.toString());
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' });
  }

  async archiveCard(cardId: string): Promise<any> {
    return this.request(`/cards/${cardId}?closed=true`, { method: 'PUT' });
  }

  // ---------- Etiquetas (NUEVO) ----------

  async getLabels(boardId: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/labels?fields=id,name,color`);
  }

  async addLabelToCard(cardId: string, labelId: string): Promise<any> {
    const params = new URLSearchParams({ value: labelId });
    return this.request(`/cards/${cardId}/idLabels?${params.toString()}`, { method: 'POST' });
  }

  async removeLabelFromCard(cardId: string, labelId: string): Promise<any> {
    return this.request(`/cards/${cardId}/idLabels/${labelId}`, { method: 'DELETE' });
  }

  // ---------- Adjuntos (NUEVO) ----------

  async getAttachments(cardId: string): Promise<any[]> {
    return this.request(`/cards/${cardId}/attachments`);
  }

  async addAttachmentByUrl(cardId: string, url: string, name?: string): Promise<any> {
    const params = new URLSearchParams({ url, ...(name ? { name } : {}) });
    return this.request(`/cards/${cardId}/attachments?${params.toString()}`, { method: 'POST' });
  }

  // Sube el archivo directo a Trello, sin guardar nada en Mongo ni en disco propio
  async addAttachmentByFile(cardId: string, buffer: Buffer, filename: string, mimetype: string): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });    formData.append('file', blob, filename);
    return this.request(`/cards/${cardId}/attachments`, {
      method: 'POST',
      body: formData,
    });
  }
}

export default new TrelloService();