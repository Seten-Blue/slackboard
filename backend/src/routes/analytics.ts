import express from 'express';
import {
  getGeneralStats,
  getStatsByDate,
  getMessageTrends,
  generateDailyReport,
} from '../controllers/analyticsController';

const router = express.Router();

// GET /api/analytics - Obtener estadisticas generales
router.get('/', getGeneralStats);

// GET /api/analytics/by-date - Obtener estadisticas por fecha
router.get('/by-date', getStatsByDate);

// GET /api/analytics/trends - Obtener tendencias de mensajes
router.get('/trends', getMessageTrends);

// POST /api/analytics/generate-report - Generar reporte diario
router.post('/generate-report', generateDailyReport);

export default router;