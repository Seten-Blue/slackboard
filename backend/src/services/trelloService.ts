const TRELLO_API_BASE = 'https://api.trello.com/1';

class TrelloService {
  private key: string;
  private token: string;

  constructor() {
    this.key = (process.env.TRELLO_API_KEY || '').trim();
    this.token = (process.env.TRELLO_TOKEN || '').trim();

    if (!this.key || !this.token) {
      console.warn('⚠️  TRELLO_API_KEY o TRELLO_TOKEN no configurados. La integracion global con Trello no funcionara.');
    } else {
      console.log('✅ Trello global configurado');
    }
  }

  isConfigured(): boolean {
    return !!this.key && !!this.token;
  }

  private authParams(key?: string, token?: string): string {
    return `key=${key || this.key}&token=${token || this.token}`;
  }

  private async request(path: string, options: any = {}, userKey?: string, userToken?: string): Promise<any> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${TRELLO_API_BASE}${path}${separator}${this.authParams(userKey, userToken)}`;

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

  private getUserCredentials(userId: string): { key: string; token: string } | null {
    return null;
  }

  // ---------- Tableros ----------

  async getBoards(userId?: string, userKey?: string, userToken?: string): Promise<any[]> {
    const key = userKey || this.key;
    const token = userToken || this.token;
    return this.request('/members/me/boards?fields=id,name,desc,url,closed', {}, key, token);
  }

  // ---------- Listas ----------

  async getLists(boardId: string, userKey?: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/lists?fields=id,name,pos`, {}, userKey, userToken);
  }

  async createList(boardId: string, name: string, userKey?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ idBoard: boardId, name });
    return this.request(`/lists?${params.toString()}`, { method: 'POST' }, userKey, userToken);
  }

  async archiveList(listId: string, userKey?: string, userToken?: string): Promise<any> {
    return this.request(`/lists/${listId}?closed=true`, { method: 'PUT' }, userKey, userToken);
  }

  // ---------- Tarjetas ----------

  async getCardsByBoard(boardId: string, userKey?: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/cards?fields=id,name,desc,idList,pos,due,dueComplete,labels,closed,badges,cover,members,idMembers,shortUrl&checklists=all&member_fields=id,fullName,avatarHash,username`, {}, userKey, userToken);
  }

  async getBoardMembers(boardId: string, userKey?: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/members?fields=id,fullName,avatarHash,username`, {}, userKey, userToken);
  }

  async createCard(listId: string, name: string, desc?: string, userKey?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({
      idList: listId,
      name,
      ...(desc ? { desc } : {}),
    });
    return this.request(`/cards?${params.toString()}`, { method: 'POST' }, userKey, userToken);
  }

  async updateCard(cardId: string, data: { name?: string; desc?: string; due?: string | null; dueComplete?: boolean; cover?: any }, userKey?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams();
    if (data.name !== undefined) params.set('name', data.name);
    if (data.desc !== undefined) params.set('desc', data.desc);
    if (data.due !== undefined) params.set('due', data.due === null ? 'null' : data.due);
    if (data.dueComplete !== undefined) params.set('dueComplete', String(data.dueComplete));
    if (data.cover !== undefined) params.set('cover', data.cover === null ? 'null' : JSON.stringify(data.cover));
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' }, userKey, userToken);
  }

  async moveCard(cardId: string, listId: string, pos?: string | number, userKey?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ idList: listId });
    if (pos !== undefined) params.set('pos', pos.toString());
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' }, userKey, userToken);
  }

  async archiveCard(cardId: string, userKey?: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}?closed=true`, { method: 'PUT' }, userKey, userToken);
  }

  // ---------- Etiquetas ----------

  async getLabels(boardId: string, userKey?: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/labels?fields=id,name,color`, {}, userKey, userToken);
  }

  async addLabelToCard(cardId: string, labelId: string, userKey?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ value: labelId });
    return this.request(`/cards/${cardId}/idLabels?${params.toString()}`, { method: 'POST' }, userKey, userToken);
  }

  async removeLabelFromCard(cardId: string, labelId: string, userKey?: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}/idLabels/${labelId}`, { method: 'DELETE' }, userKey, userToken);
  }

  // ---------- Checklists ----------

  async updateCheckItem(cardId: string, checklistId: string, itemId: string, state: string, userKey?: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}/checklists/${checklistId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }, userKey, userToken);
  }

  // ---------- Comentarios / Actividad ----------

  async getCardActions(cardId: string, userKey?: string, userToken?: string): Promise<any[]> {
    return this.request(`/cards/${cardId}/actions?filter=commentCard,updateCard:desc,addAttachmentToCard,addMemberToCard,createCard,moveCardFromBoard,moveCardToBoard&limit=50`, {}, userKey, userToken);
  }

  async addComment(cardId: string, text: string, userKey?: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}/actions/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }, userKey, userToken);
  }

  // ---------- Adjuntos ----------

  async getAttachments(cardId: string, userKey?: string, userToken?: string): Promise<any[]> {
    return this.request(`/cards/${cardId}/attachments`, {}, userKey, userToken);
  }

  async addAttachmentByUrl(cardId: string, url: string, name?: string, userKey?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ url, ...(name ? { name } : {}) });
    return this.request(`/cards/${cardId}/attachments?${params.toString()}`, { method: 'POST' }, userKey, userToken);
  }

  async addAttachmentByFile(cardId: string, buffer: Buffer, filename: string, mimetype: string, userKey?: string, userToken?: string): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
    formData.append('file', blob, filename);
    return this.request(`/cards/${cardId}/attachments`, {
      method: 'POST',
      body: formData,
    }, userKey, userToken);
  }

  async fetchAttachmentBinary(attachmentUrl: string, userKey?: string, userToken?: string): Promise<{ buffer: Buffer; contentType: string }> {
    const separator = attachmentUrl.includes('?') ? '&' : '?';
    const url = `${attachmentUrl}${separator}${this.authParams(userKey, userToken)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el adjunto de Trello (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }
}

export default new TrelloService();