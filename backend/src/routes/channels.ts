import express from 'express';
import {
  getAllChannels,
  getChannelById,
  createChannel,
  addMemberToChannel,
  updateChannel,
  leaveChannel,
  deleteChannel,
} from '../controllers/channelController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.use(requireAuth); // todas las rutas de canales requieren estar logueado

router.get('/', getAllChannels);
router.get('/:id', getChannelById);
router.post('/', createChannel);
router.put('/:id', updateChannel);
router.post('/:id/leave', leaveChannel);
router.post('/add-member', addMemberToChannel);
router.delete('/:id', deleteChannel);

export default router;