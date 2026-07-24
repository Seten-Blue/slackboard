import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getPerformanceSnapshot,
  getPerformanceHistory,
  getPerformanceTrends,
  getPerformanceAlerts,
  checkIntegrationLatency,
} from '../controllers/performanceController';

const router = express.Router();

router.use(requireAuth);

router.get('/snapshot', getPerformanceSnapshot);
router.get('/history', getPerformanceHistory);
router.get('/trends', getPerformanceTrends);
router.get('/alerts', getPerformanceAlerts);
router.get('/integrations', checkIntegrationLatency);

export default router;
