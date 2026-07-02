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

const router = express.Router();

// GET /api/channels
router.get('/', getAllChannels);

// GET /api/channels/:id
router.get('/:id', getChannelById);

// POST /api/channels
router.post('/', createChannel);

// PUT /api/channels/:id
router.put('/:id', updateChannel);

// POST /api/channels/:id/leave
router.post('/:id/leave', leaveChannel);

// POST /api/channels/add-member
router.post('/add-member', addMemberToChannel);

// DELETE /api/channels/:id
router.delete('/:id', deleteChannel);

export default router;