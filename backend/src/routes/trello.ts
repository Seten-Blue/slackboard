import express from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import {
  getBoards,
  getBoardContents,
  createList,
  archiveList,
  createCard,
  updateCard,
  moveCard,
  archiveCard,
  getBoardLabels,
  toggleCardLabel,
  getCardAttachments,
  addCardAttachmentUrl,
  uploadCardAttachment,
  viewCardAttachment,
} from '../controllers/trelloController';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ← pública a propósito: un <img src> no puede mandar el header Authorization,
// y el proxy nunca expone el key/token real de Trello
router.get('/cards/:cardId/attachments/:attachmentId/view', viewCardAttachment);

router.use(requireAuth);

// Tableros
router.get('/boards', getBoards);
router.get('/boards/:boardId', getBoardContents);
router.get('/boards/:boardId/labels', getBoardLabels);

// Listas
router.post('/boards/:boardId/lists', createList);
router.put('/lists/:listId/archive', archiveList);

// Tarjetas
router.post('/cards', createCard);
router.put('/cards/:cardId', updateCard);
router.put('/cards/:cardId/move', moveCard);
router.put('/cards/:cardId/archive', archiveCard);

// Etiquetas en una tarjeta
router.post('/cards/:cardId/labels/:labelId', toggleCardLabel);

// Adjuntos
router.get('/cards/:cardId/attachments', getCardAttachments);
router.post('/cards/:cardId/attachments/url', addCardAttachmentUrl);
router.post('/cards/:cardId/attachments/file', upload.single('file'), uploadCardAttachment);

export default router;