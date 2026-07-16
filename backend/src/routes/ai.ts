import express from 'express';
import { getAIStatus, toggleAIForChannel, getOrCreateAIChannel } from '../controllers/aiController';

const router = express.Router();

router.get('/status', getAIStatus);
router.post('/channels/:id/toggle', toggleAIForChannel);
router.post('/channel', getOrCreateAIChannel);

export default router;