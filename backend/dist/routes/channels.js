"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const channelController_1 = require("../controllers/channelController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use(auth_1.requireAuth); // todas las rutas de canales requieren estar logueado
router.get('/', channelController_1.getAllChannels);
router.get('/:id', channelController_1.getChannelById);
router.post('/', channelController_1.createChannel);
router.put('/:id', channelController_1.updateChannel);
router.post('/:id/leave', channelController_1.leaveChannel);
router.post('/:id/read', channelController_1.markChannelRead);
router.post('/add-member', channelController_1.addMemberToChannel);
router.delete('/:id', channelController_1.deleteChannel);
exports.default = router;
