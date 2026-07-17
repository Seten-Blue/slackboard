import express from 'express';
import { verifyWebhook, receiveWebhook, joinWhatsAppInbox, getStatus } from '../controllers/whatsappController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

router.get('/status', getStatus);
router.get('/webhook', verifyWebhook);   // Meta llama esto UNA vez, al configurar
router.post('/webhook', receiveWebhook); // Meta llama esto cada vez que llega un mensaje
router.post('/join', requireAuth, joinWhatsAppInbox);

export default router;