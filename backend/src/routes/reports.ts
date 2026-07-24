import express from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createReport,
  getReports,
  getReport,
  deleteReport,
  signReport,
  shareReport,
  exportReport,
  scheduleReport,
  getScheduledReports,
  deleteScheduledReport,
} from '../controllers/reportsController';

const router = express.Router();

router.use(requireAuth);

router.post('/', createReport);
router.get('/', getReports);
router.get('/scheduled', getScheduledReports);
router.post('/schedule', scheduleReport);
router.delete('/scheduled/:id', deleteScheduledReport);
router.get('/:reportId', getReport);
router.delete('/:reportId', deleteReport);
router.post('/:reportId/sign', signReport);
router.post('/:reportId/share', shareReport);
router.get('/:reportId/export', exportReport);

export default router;
