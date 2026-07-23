import { Response } from 'express';
import mongoose from 'mongoose';
import Friendship from '../models/Friendship';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

// Helper: normalize pair so userA < userB
function normalizePair(a: string, b: string): { userA: string; userB: string } {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

// POST /api/friendship/request
export const sendRequest = async (req: AuthRequest, res: Response) => {
  try {
    const from = req.userId!;
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'Falta el destinatario' });
    if (from === to) return res.status(400).json({ success: false, message: 'No podes agregarte a vos mismo' });

    const target = await User.findById(to).select('_id');
    if (!target) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

    const { userA, userB } = normalizePair(from, to);
    const existing = await Friendship.findOne({ userA, userB });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ success: false, message: 'Ya son amigos' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ success: false, message: 'Ya hay una solicitud pendiente' });
      }
      // Was rejected, allow re-request
      existing.status = 'pending';
      existing.initiator = new mongoose.Types.ObjectId(from);
      await existing.save();
      return res.json({ success: true, message: 'Solicitud reenviada' });
    }

    await Friendship.create({ userA, userB, initiator: from, status: 'pending' });
    res.json({ success: true, message: 'Solicitud enviada' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error enviando solicitud', error: error.message });
  }
};

// PUT /api/friendship/accept/:id
export const acceptRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const friendship = await Friendship.findById(id);
    if (!friendship) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (friendship.status !== 'pending') return res.status(400).json({ success: false, message: 'La solicitud no esta pendiente' });

    const uid = new mongoose.Types.ObjectId(userId);
    if (!friendship.userA.equals(uid) && !friendship.userB.equals(uid)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    if (friendship.initiator.equals(uid)) {
      return res.status(400).json({ success: false, message: 'No podes aceptar tu propia solicitud' });
    }

    friendship.status = 'accepted';
    await friendship.save();
    res.json({ success: true, message: 'Solicitud aceptada' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error aceptando solicitud', error: error.message });
  }
};

// PUT /api/friendship/reject/:id
export const rejectRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const friendship = await Friendship.findById(id);
    if (!friendship) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (friendship.status !== 'pending') return res.status(400).json({ success: false, message: 'La solicitud no esta pendiente' });

    const uid = new mongoose.Types.ObjectId(userId);
    if (!friendship.userA.equals(uid) && !friendship.userB.equals(uid)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }
    if (friendship.initiator.equals(uid)) {
      return res.status(400).json({ success: false, message: 'No podes rechazar tu propia solicitud' });
    }

    friendship.status = 'rejected';
    await friendship.save();
    res.json({ success: true, message: 'Solicitud rechazada' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error rechazando solicitud', error: error.message });
  }
};

// DELETE /api/friendship/cancel/:id
export const cancelRequest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const friendship = await Friendship.findById(id);
    if (!friendship) return res.status(404).json({ success: false, message: 'Solicitud no encontrada' });
    if (friendship.status !== 'pending') return res.status(400).json({ success: false, message: 'Solo podes cancelar solicitudes pendientes' });

    const uid = new mongoose.Types.ObjectId(userId);
    if (!friendship.initiator.equals(uid)) {
      return res.status(403).json({ success: false, message: 'Solo el iniciador puede cancelar' });
    }

    await Friendship.findByIdAndDelete(id);
    res.json({ success: true, message: 'Solicitud cancelada' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error cancelando solicitud', error: error.message });
  }
};

// DELETE /api/friendship/remove/:id
export const removeFriend = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const friendship = await Friendship.findById(id);
    if (!friendship) return res.status(404).json({ success: false, message: 'Amistad no encontrada' });
    if (friendship.status !== 'accepted') return res.status(400).json({ success: false, message: 'No son amigos' });

    const uid = new mongoose.Types.ObjectId(userId);
    if (!friendship.userA.equals(uid) && !friendship.userB.equals(uid)) {
      return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    await Friendship.findByIdAndDelete(id);
    res.json({ success: true, message: 'Amigo eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error eliminando amigo', error: error.message });
  }
};

// GET /api/friendship/list
export const listFriends = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const uid = new mongoose.Types.ObjectId(userId);

    const friendships = await Friendship.find({
      $or: [{ userA: uid }, { userB: uid }],
      status: 'accepted',
    }).populate('userA userB', 'username avatar status');

    const friends = friendships.map((f: any) => {
      const friend = f.userA._id.equals(uid) ? f.userB : f.userA;
      return { friendshipId: f._id, _id: friend._id, username: friend.username, avatar: friend.avatar, status: friend.status };
    });

    res.json({ success: true, data: friends });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error listando amigos', error: error.message });
  }
};

// GET /api/friendship/pending
export const listPending = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const uid = new mongoose.Types.ObjectId(userId);

    const friendships = await Friendship.find({
      $or: [{ userA: uid }, { userB: uid }],
      status: 'pending',
    }).populate('userA userB', 'username avatar');

    const received = friendships
      .filter((f: any) => f.userB._id.equals(uid))
      .map((f: any) => ({ _id: f._id, from: f.userA, createdAt: f.createdAt }));

    const sent = friendships
      .filter((f: any) => f.userA._id.equals(uid))
      .map((f: any) => ({ _id: f._id, to: f.userB, createdAt: f.createdAt }));

    res.json({ success: true, data: { received, sent } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error listando solicitudes', error: error.message });
  }
};

// GET /api/friendship/search?q=username
export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const q = (req.query.q as string || '').trim();
    if (q.length < 2) return res.json({ success: true, data: [] });

    const users = await User.find({
      _id: { $ne: userId },
      username: { $regex: q, $options: 'i' },
    }).select('username avatar status').limit(20).lean();

    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error buscando usuarios', error: error.message });
  }
};

// Helper: get friend IDs for a user (used by analytics)
export async function getFriendIds(userId: string): Promise<mongoose.Types.ObjectId[]> {
  const uid = new mongoose.Types.ObjectId(userId);
  const friendships = await Friendship.find({
    $or: [{ userA: uid }, { userB: uid }],
    status: 'accepted',
  }).select('userA userB').lean();

  const ids: mongoose.Types.ObjectId[] = [];
  for (const f of friendships) {
    const fa = f.userA as mongoose.Types.ObjectId;
    const fb = f.userB as mongoose.Types.ObjectId;
    ids.push(fa.equals(uid) ? fb : fa);
  }
  return ids;
}
