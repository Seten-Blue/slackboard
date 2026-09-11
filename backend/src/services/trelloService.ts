const TRELLO_API_BASE = 'https://api.trello.com/1';

class TrelloService {
  private key: string;

  constructor() {
    this.key = (process.env.TRELLO_API_KEY || '').trim();

    if (!this.key) {
      console.warn('TRELLO_API_KEY no configurado. La integracion global con Trello no funcionara.');
    } else {
      console.log('✅ Trello configurado');
    }
  }

  isConfigured(): boolean {
    return !!this.key;
  }

  getApiKey(): string {
    return this.key;
  }

  private authParams(userToken?: string): string {
    return `key=${this.key}&token=${userToken || ''}`;
  }

  private async request(path: string, options: any = {}, userToken?: string): Promise<any> {
    const separator = path.includes('?') ? '&' : '?';
    const url = `${TRELLO_API_BASE}${path}${separator}${this.authParams(userToken)}`;

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

  async getBoards(userToken?: string): Promise<any[]> {
    return this.request('/members/me/boards?fields=id,name,desc,url,closed', {}, userToken);
  }

  // ---------- Listas ----------

  async getLists(boardId: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/lists?fields=id,name,pos`, {}, userToken);
  }

  async createList(boardId: string, name: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ idBoard: boardId, name });
    return this.request(`/lists?${params.toString()}`, { method: 'POST' }, userToken);
  }

  async archiveList(listId: string, userToken?: string): Promise<any> {
    return this.request(`/lists/${listId}?closed=true`, { method: 'PUT' }, userToken);
  }

  // ---------- Tarjetas ----------

  async getCardsByBoard(boardId: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/cards?fields=id,name,desc,idList,pos,due,dueComplete,labels,closed,badges,cover,members,idMembers,shortUrl&checklists=all&member_fields=id,fullName,avatarHash,username`, {}, userToken);
  }

  // /boards/{id}/cards NO incluye los scaled de la portada; /cards/{id}
  // completa SI los incluye. Se usa para enriquecer las portadas.
  async getCardCover(cardId: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}?fields=all`, {}, userToken);
  }

  async getBoardMembers(boardId: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/members?fields=id,fullName,avatarHash,username`, {}, userToken);
  }

  async createCard(listId: string, name: string, desc?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({
      idList: listId,
      name,
      ...(desc ? { desc } : {}),
    });
    return this.request(`/cards?${params.toString()}`, { method: 'POST' }, userToken);
  }

  async updateCard(cardId: string, data: { name?: string; desc?: string; due?: string | null; dueComplete?: boolean; cover?: any }, userToken?: string): Promise<any> {
    const params = new URLSearchParams();
    if (data.name !== undefined) params.set('name', data.name);
    if (data.desc !== undefined) params.set('desc', data.desc);
    if (data.due !== undefined) params.set('due', data.due === null ? 'null' : data.due);
    if (data.dueComplete !== undefined) params.set('dueComplete', String(data.dueComplete));
    if (data.cover !== undefined) params.set('cover', data.cover === null ? 'null' : JSON.stringify(data.cover));
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' }, userToken);
  }

  async moveCard(cardId: string, listId: string, pos?: string | number, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ idList: listId });
    if (pos !== undefined) params.set('pos', pos.toString());
    return this.request(`/cards/${cardId}?${params.toString()}`, { method: 'PUT' }, userToken);
  }

  async archiveCard(cardId: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}?closed=true`, { method: 'PUT' }, userToken);
  }

  // ---------- Etiquetas ----------

  async getLabels(boardId: string, userToken?: string): Promise<any[]> {
    return this.request(`/boards/${boardId}/labels?fields=id,name,color`, {}, userToken);
  }

  async addLabelToCard(cardId: string, labelId: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ value: labelId });
    return this.request(`/cards/${cardId}/idLabels?${params.toString()}`, { method: 'POST' }, userToken);
  }

  async removeLabelFromCard(cardId: string, labelId: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}/idLabels/${labelId}`, { method: 'DELETE' }, userToken);
  }

  // ---------- Checklists ----------

  async updateCheckItem(cardId: string, checklistId: string, itemId: string, state: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}/checklists/${checklistId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }, userToken);
  }

  // ---------- Comentarios / Actividad ----------

  async getCardActions(cardId: string, userToken?: string): Promise<any[]> {
    return this.request(`/cards/${cardId}/actions?filter=commentCard,updateCard:desc,addAttachmentToCard,addMemberToCard,createCard,moveCardFromBoard,moveCardToBoard&limit=50`, {}, userToken);
  }

  async addComment(cardId: string, text: string, userToken?: string): Promise<any> {
    return this.request(`/cards/${cardId}/actions/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }, userToken);
  }

  // ---------- Adjuntos ----------

  async getAttachments(cardId: string, userToken?: string): Promise<any[]> {
    return this.request(`/cards/${cardId}/attachments`, {}, userToken);
  }

  async addAttachmentByUrl(cardId: string, url: string, name?: string, userToken?: string): Promise<any> {
    const params = new URLSearchParams({ url, ...(name ? { name } : {}) });
    return this.request(`/cards/${cardId}/attachments?${params.toString()}`, { method: 'POST' }, userToken);
  }

  async addAttachmentByFile(cardId: string, buffer: Buffer, filename: string, mimetype: string, userToken?: string): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
    formData.append('file', blob, filename);
    return this.request(`/cards/${cardId}/attachments`, {
      method: 'POST',
      body: formData,
    }, userToken);
  }

  async fetchAttachmentBinary(attachmentUrl: string, userToken?: string): Promise<{ buffer: Buffer; contentType: string }> {
    const separator = attachmentUrl.includes('?') ? '&' : '?';
    const url = `${attachmentUrl}${separator}${this.authParams(userToken)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el adjunto de Trello (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  // ---------- Vigilancia de actividad (notificaciones) ----------

  async getMemberId(userToken?: string): Promise<string> {
    const me = await this.request('/members/me?fields=id,username', {}, userToken);
    return me?.id || '';
  }

  async getBoardActions(boardId: string, userToken?: string, since?: string): Promise<any[]> {
    const sinceParam = since ? `&since=${encodeURIComponent(since)}` : '';
    return this.request(
      `/boards/${boardId}/actions?filter=createCard,commentCard,updateCard,addMemberToCard,removeMemberFromCard,addAttachmentToCard&limit=100&card_fields=id,name,idShort,shortLink&fields=id,idMemberCreator,type,date,data,memberCreator${sinceParam}`,
      {},
      userToken,
    );
  }
}

export default new TrelloService();
