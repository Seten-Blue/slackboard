import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getGeneralStats,
  getStatsByDate,
  getMessageTrends,
  generateDailyReport,
  getActivity,
  getTraffic,
  getStatistics,
} from '../controllers/analyticsController';

const router = express.Router();

// Dashboard submodules (user-scoped, require auth)
router.get('/activity', requireAuth, getActivity);
router.get('/traffic', requireAuth, getTraffic);
router.get('/stats', requireAuth, getStatistics);

// Legacy (global, no auth needed for backward compat)
router.get('/', getGeneralStats);
router.get('/by-date', getStatsByDate);
router.get('/trends', getMessageTrends);
router.post('/generate-report', generateDailyReport);

export default router;
