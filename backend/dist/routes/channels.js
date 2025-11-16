"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const channelController_1 = require("../controllers/channelController");
const router = express_1.default.Router();
// GET /api/channels - Obtener todos los canales
router.get('/', channelController_1.getAllChannels);
// GET /api/channels/:id - Obtener un canal por ID
router.get('/:id', channelController_1.getChannelById);
// POST /api/channels - Crear un nuevo canal
router.post('/', channelController_1.createChannel);
// POST /api/channels/add-member - Agregar miembro a un canal
router.post('/add-member', channelController_1.addMemberToChannel);
// DELETE /api/channels/:id - Eliminar un canal
router.delete('/:id', channelController_1.deleteChannel);
exports.default = router;
