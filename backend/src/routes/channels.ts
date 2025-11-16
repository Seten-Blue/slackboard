import express from 'express';
import {
  getAllChannels,
  getChannelById,
  createChannel,
  addMemberToChannel,
  deleteChannel,
} from '../controllers/channelController';

const router = express.Router();

// GET /api/channels - Obtener todos los canales
router.get('/', getAllChannels);

// GET /api/channels/:id - Obtener un canal por ID
router.get('/:id', getChannelById);

// POST /api/channels - Crear un nuevo canal
router.post('/', createChannel);

// POST /api/channels/add-member - Agregar miembro a un canal
router.post('/add-member', addMemberToChannel);

// DELETE /api/channels/:id - Eliminar un canal
router.delete('/:id', deleteChannel);

export default router;