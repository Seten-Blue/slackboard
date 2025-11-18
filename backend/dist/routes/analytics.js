"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const analyticsController_1 = require("../controllers/analyticsController");
const router = express_1.default.Router();
// GET /api/analytics - Obtener estadísticas generales
router.get('/', analyticsController_1.getGeneralStats);
// GET /api/analytics/by-date - Obtener estadísticas por fecha
router.get('/by-date', analyticsController_1.getStatsByDate);
// GET /api/analytics/trends - Obtener tendencias de mensajes
router.get('/trends', analyticsController_1.getMessageTrends);
// POST /api/analytics/generate-report - Generar reporte diario
router.post('/generate-report', analyticsController_1.generateDailyReport);
exports.default = router;
//# sourceMappingURL=analytics.js.map