import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  removeFriend,
  listFriends,
  listPending,
  searchUsers,
} from '../controllers/friendshipController';

const router = Router();

router.get('/search', requireAuth, searchUsers);
router.get('/list', requireAuth, listFriends);
router.get('/pending', requireAuth, listPending);
router.post('/request', requireAuth, sendRequest);
router.put('/accept/:id', requireAuth, acceptRequest);
router.put('/reject/:id', requireAuth, rejectRequest);
router.delete('/cancel/:id', requireAuth, cancelRequest);
router.delete('/remove/:id', requireAuth, removeFriend);

export default router;
