"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const analyticsController_1 = require("../controllers/analyticsController");
const router = express_1.default.Router();
// Dashboard submodules (user-scoped, require auth)
router.get('/activity', auth_1.requireAuth, analyticsController_1.getActivity);
router.get('/traffic', auth_1.requireAuth, analyticsController_1.getTraffic);
router.get('/stats', auth_1.requireAuth, analyticsController_1.getStatistics);
// Legacy (global, no auth needed for backward compat)
router.get('/', analyticsController_1.getGeneralStats);
router.get('/by-date', analyticsController_1.getStatsByDate);
router.get('/trends', analyticsController_1.getMessageTrends);
router.post('/generate-report', analyticsController_1.generateDailyReport);
exports.default = router;
