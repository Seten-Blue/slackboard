import axios from 'axios';
import dotenv from 'dotenv';
import TrelloTask from '../models/TrelloTask';

dotenv.config();

class TrelloService {
  private apiKey: string;
  private apiToken: string;
  private baseUrl = 'https://api.trello.com/1';

  constructor() {
    this.apiKey = process.env.TRELLO_API_KEY || '';
    this.apiToken = process.env.TRELLO_API_TOKEN || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.apiToken;
  }

  private getAuthParams() {
    return {
      key: this.apiKey,
      token: this.apiToken,
    };
  }

  // Obtener todos los boards del usuario
  async getBoards(): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/members/me/boards`, {
        params: this.getAuthParams(),
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error obteniendo boards:', error.message);
      throw new Error(`Error obteniendo boards: ${error.message}`);
    }
  }

  // Obtener listas de un board
  async getBoardLists(boardId: string): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/boards/${boardId}/lists`, {
        params: this.getAuthParams(),
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error obteniendo listas:', error.message);
      throw new Error(`Error obteniendo listas: ${error.message}`);
    }
  }

  // Obtener tarjetas de un board
  async getBoardCards(boardId: string): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/boards/${boardId}/cards`, {
        params: {
          ...this.getAuthParams(),
          fields: 'all',
          members: 'true',
          member_fields: 'all',
          labels: 'all',
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error obteniendo tarjetas:', error.message);
      throw new Error(`Error obteniendo tarjetas: ${error.message}`);
    }
  }

  // Crear una nueva tarjeta
  async createCard(data: {
    name: string;
    desc?: string;
    listId: string;
    dueDate?: string;
    labels?: string[];
  }): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      const response = await axios.post(`${this.baseUrl}/cards`, null, {
        params: {
          ...this.getAuthParams(),
          idList: data.listId,
          name: data.name,
          desc: data.desc || '',
          due: data.dueDate || null,
          idLabels: data.labels?.join(',') || '',
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creando tarjeta:', error.message);
      throw new Error(`Error creando tarjeta: ${error.message}`);
    }
  }

  // Actualizar una tarjeta
  async updateCard(cardId: string, data: {
    name?: string;
    desc?: string;
    due?: string;
    idList?: string;
  }): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      const response = await axios.put(`${this.baseUrl}/cards/${cardId}`, null, {
        params: {
          ...this.getAuthParams(),
          ...data,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error actualizando tarjeta:', error.message);
      throw new Error(`Error actualizando tarjeta: ${error.message}`);
    }
  }

  // Eliminar una tarjeta
  async deleteCard(cardId: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      await axios.delete(`${this.baseUrl}/cards/${cardId}`, {
        params: this.getAuthParams(),
      });
    } catch (error: any) {
      console.error('❌ Error eliminando tarjeta:', error.message);
      throw new Error(`Error eliminando tarjeta: ${error.message}`);
    }
  }

  // Sincronizar tarjetas de Trello con MongoDB
  async syncBoardCards(boardId: string, channelId?: string): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }

    try {
      const cards = await this.getBoardCards(boardId);
      const lists = await this.getBoardLists(boardId);
      const boards = await this.getBoards();
      const board = boards.find((b: any) => b.id === boardId);

      const syncedTasks = [];

      for (const card of cards) {
        const list = lists.find((l: any) => l.id === card.idList);

        const taskData = {
          trelloId: card.id,
          name: card.name,
          description: card.desc || '',
          listId: card.idList,
          listName: list?.name || 'Unknown',
          boardId: boardId,
          boardName: board?.name || 'Unknown',
          dueDate: card.due ? new Date(card.due) : undefined,
          labels: card.labels?.map((l: any) => l.name) || [],
          url: card.url,
          channel: channelId,
          syncedAt: new Date(),
        };

        const task = await TrelloTask.findOneAndUpdate(
          { trelloId: card.id },
          taskData,
          { upsert: true, new: true }
        );

        syncedTasks.push(task);
      }

      console.log(`✅ ${syncedTasks.length} tarjetas sincronizadas desde Trello`);
      return syncedTasks;
    } catch (error: any) {
      console.error('❌ Error sincronizando tarjetas:', error.message);
      throw new Error(`Error sincronizando: ${error.message}`);
    }
  }

  // Obtener tarjetas sincronizadas de MongoDB
  async getSyncedTasks(channelId?: string): Promise<any[]> {
    try {
      const query = channelId ? { channel: channelId } : {};
      return await TrelloTask.find(query).sort({ createdAt: -1 });
    } catch (error: any) {
      console.error('❌ Error obteniendo tareas:', error.message);
      return [];
    }
  }

  // Obtener acciones recientes de un board (modificaciones, creaciones, comentarios, etc)
  async getBoardActions(boardId: string, limit: number = 20): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Trello no está configurado');
    }
    try {
      const response = await axios.get(`${this.baseUrl}/boards/${boardId}/actions`, {
        params: {
          ...this.getAuthParams(),
          limit,
          filter: 'updateCard,createCard,commentCard,moveCardToBoard,moveCardFromBoard',
          fields: 'id,type,date,data,memberCreator',
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error obteniendo acciones del board:', error.message);
      throw new Error(`Error obteniendo acciones: ${error.message}`);
    }
  }
}

export default new TrelloService();