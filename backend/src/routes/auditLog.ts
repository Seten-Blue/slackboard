import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getAuditLogs,
  getAuditLog,
  getAuditStats,
  getUserActivity,
  getRecentActivity,
  searchLogs,
} from '../controllers/auditLogController';

const router = Router();

router.use(requireAuth);

router.get('/', getAuditLogs);
router.get('/stats', getAuditStats);
router.get('/recent', getRecentActivity);
router.get('/search', searchLogs);
router.get('/user/:userId', getUserActivity);
router.get('/:logId', getAuditLog);

export default router;
