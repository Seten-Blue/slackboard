import express from 'express';
import { getAIStatus, toggleAIForChannel, getOrCreateAIChannel } from '../controllers/aiController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.get('/status', getAIStatus);
router.post('/channels/:id/toggle', toggleAIForChannel);
router.post('/channel', requireAuth, getOrCreateAIChannel);

export default router;