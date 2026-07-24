import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getMetrics,
  getMetricStats,
  getUsageByDepartment,
  getCostReport,
  getPerformanceReport,
  getModelComparison,
} from '../controllers/aiMetricsController';

const router = Router();

router.use(requireAuth);

router.get('/', getMetrics);
router.get('/stats', getMetricStats);
router.get('/departments', getUsageByDepartment);
router.get('/costs', getCostReport);
router.get('/performance', getPerformanceReport);
router.get('/models', getModelComparison);

export default router;
