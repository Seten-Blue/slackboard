import { Server } from 'socket.io';
import mongoose from 'mongoose';
import User from '../models/User';
import trelloService from './trelloService';
import { decryptToken } from '../utils/crypto';

const WATCH_INTERVAL_MS = 30_000;
const POLL_DELAY_MS = 10_000;
const ALLOWED_TYPES = new Set([
  'createCard',
  'commentCard',
  'updateCard',
  'addMemberToCard',
  'removeMemberFromCard',
  'addAttachmentToCard',
]);

const RELEVANT_TYPES_REQUIRING_ME = new Set(['addMemberToCard', 'removeMemberFromCard']);

interface NotificationPayload {
  type: string;
  actionId: string;
  title: string;
  detail: string;
  boardId: string;
  boardName: string;
  cardId: string;
  cardName: string;
  cardUrl: string;
  actorId: string;
  actorName: string;
  ts: string;
}

const MAX_TRACKED_IDS = 200;

let running = false;
let ioRef: Server | null = null;
const memberIdCache = new Map<string, { id: string; at: number }>();

function getSyncCollection() {
  return mongoose.connection.db!.collection('trellosyncs');
}

function describeAction(a: any): { title: string; detail: string } {
  const type = a.type;
  const actor = a.memberCreator?.fullName || a.memberCreator?.username || 'Alguien';
  const card = a.data?.card;
  const cardName = card?.name || 'una tarjeta';
  const boardName = a.data?.board?.name || '';
  const listName = a.data?.list?.name || '';

  switch (type) {
    case 'commentCard': {
      const text = (a.data?.text || '').trim();
      const detail = text.length > 180 ? `${text.substring(0, 177)}...` : text;
      return { title: `${actor} comentó en «${cardName}»`, detail };
    }
    case 'createCard':
      return { title: `${actor} creó la tarjeta «${cardName}»`, detail: boardName ? `En el tablero ${boardName}` : '' };
    case 'updateCard': {
      const old = a.data?.old || {};
      if (old.cover) return { title: `${actor} cambió la portada de «${cardName}»`, detail: '' };
      if (old.name) return { title: `${actor} renombró la tarjeta «${cardName}»`, detail: listName ? `Lista: ${listName}` : '' };
      if (old.idList) return { title: `${actor} movió «${cardName}»`, detail: listName ? `A la lista ${listName}` : '' };
      if (old.desc) return { title: `${actor} cambió la descripción de «${cardName}»`, detail: '' };
      if (old.due) return { title: `${actor} actualizó la fecha de «${cardName}»`, detail: '' };
      return { title: `${actor} actualizó «${cardName}»`, detail: '' };
    }
    case 'addMemberToCard': {
      const member = a.data?.member?.fullName || '';
      return { title: member ? `${actor} agregó a ${member} a «${cardName}»` : `${actor} agregó un miembro a «${cardName}»`, detail: '' };
    }
    case 'removeMemberFromCard': {
      const member = a.data?.member?.fullName || '';
      return { title: member ? `${actor} quitó a ${member} de «${cardName}»` : `${actor} quitó un miembro de «${cardName}»`, detail: '' };
    }
    case 'addAttachmentToCard':
      return { title: `${actor} agregó un adjunto a «${cardName}»`, detail: '' };
    default:
      return { title: `${actor} modificó «${cardName}»`, detail: '' };
  }
}

async function pollUser(io: Server, user: any): Promise<void> {
  const userId = user._id.toString();
  let token: string | null = null;
  try {
    token = decryptToken(user.trelloToken);
  } catch (e: any) {
    console.warn(`⚠️ [trelloWatch] No se pudo descifrar el token de ${userId}: ${e.message}`);
    return;
  }
  if (!token) return;

  let meId = memberIdCache.get(userId)?.id;
  if (!meId) {
    try {
      meId = await trelloService.getMemberId(token);
    } catch (e: any) {
      console.warn(`⚠️ [trelloWatch] Token de Trello invalido para ${userId}: ${e.message}`);
      return;
    }
    if (meId) memberIdCache.set(userId, { id: meId, at: Date.now() });
  }

  let boards: any[] = [];
  try {
    boards = (await trelloService.getBoards(token)).filter((b: any) => !b.closed);
  } catch (e: any) {
    console.warn(`⚠️ [trelloWatch] No se pudieron listar tableros de ${userId}: ${e.message}`);
    return;
  }

  const coll = getSyncCollection();
  const emits: NotificationPayload[] = [];

  for (const board of boards) {
    const boardId = board.id;
    try {
      const cursor = await coll.findOne({ userId, boardId });
      const since = cursor?.lastAt
        ? new Date(cursor.lastAt).toISOString()
        : new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const actions = await trelloService.getBoardActions(boardId, token, since);
      if (!Array.isArray(actions) || actions.length === 0) continue;

      const prevIds = new Set<string>(cursor?.recentIds || []);
      let newestScanDate: Date | null = null;
      const newIds: string[] = [];
      const relevant: any[] = [];

      for (const a of actions) {
        const actDate = new Date(a.date);
        if (!newestScanDate || actDate > newestScanDate) newestScanDate = actDate;

        if (!ALLOWED_TYPES.has(a.type)) continue;

        /* Dedupe por ID de acción: garantiza que cada acción se emita UNA sola vez,
           incluso si la API de Trello repite acciones o `since` es inclusivo. */
        if (prevIds.has(a.id)) continue;
        if (cursor?.lastAt && actDate <= new Date(cursor.lastAt)) continue;
        newIds.push(a.id);

        /* Solo notificar acciones de OTROS (no las propias). */
        const actorId = a.memberCreator?.id || a.idMemberCreator;
        if (!actorId || actorId === meId) continue;
        if (RELEVANT_TYPES_REQUIRING_ME.has(a.type) && a.data?.member?.id && a.data.member.id !== meId) continue;
        relevant.push(a);
      }

      if (newIds.length === 0 || !newestScanDate) continue;

      for (const a of relevant.sort((x: any, y: any) => new Date(x.date).getTime() - new Date(y.date).getTime())) {
        const { title, detail } = describeAction(a);
        const card = a.data?.card || {};
        emits.push({
          type: 'trello',
          actionId: a.id,
          title,
          detail,
          boardId,
          boardName: board.name || a.data?.board?.name || '',
          cardId: card.id || '',
          cardName: card.name || '',
          cardUrl: card.shortLink ? `https://trello.com/c/${card.shortLink}` : '',
          actorId: a.memberCreator?.id || a.idMemberCreator || '',
          actorName: a.memberCreator?.fullName || a.memberCreator?.username || '',
          ts: a.date,
        });
      }

      const recentIds = [...new Set<string>([...(cursor?.recentIds || []), ...newIds])].slice(-MAX_TRACKED_IDS);
      await coll.updateOne(
        { userId, boardId },
        {
          $set: {
            lastAt: newestScanDate.toISOString(),
            recentIds,
            lastId: newIds[newIds.length - 1],
            updatedAt: new Date().toISOString(),
          },
        },
        { upsert: true },
      );
    } catch (e: any) {
      console.warn(`⚠️ [trelloWatch] Error en tablero ${boardId} de ${userId}: ${e.message}`);
    }
  }

  if (emits.length > 0) {
    for (const e of emits.slice(0, 20)) {
      io.to(`user:${userId}`).emit('trello:notification', e);
    }
    console.log(`🔔 [trelloWatch] ${emits.length} notificacion(es) de Trello enviadas a ${userId}`);
  }
}

async function tick(): Promise<void> {
  if (running || !ioRef) return;
  running = true;
  try {
    const users = await User.find({ trelloToken: { $exists: true, $nin: [null, ''] } }).select('_id trelloToken').lean();
    for (const u of users) {
      await pollUser(ioRef, u);
    }
  } catch (e: any) {
    console.warn('⚠️ [trelloWatch] Error general:', e.message);
  } finally {
    running = false;
  }
}

export function startTrelloWatcher(io: Server): void {
  ioRef = io;
  console.log('👀 [trelloWatch] Vigilancia de modificaciones de Trello activada');
  setTimeout(() => {
    tick().catch(() => {});
    setInterval(() => tick().catch(() => {}), WATCH_INTERVAL_MS);
  }, POLL_DELAY_MS);
}