import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createTask,
  getTasks,
  getTask,
  updateTask,
  deleteTask,
  assignTask,
  updateStatus,
  addTimeEntry,
  addComment,
  addSubtask,
  toggleSubtask,
  getTaskStats,
  getTaskReport,
  getTaskPermissions,
} from '../controllers/tasksController';

const router = Router();

router.use(requireAuth);

router.post('/', createTask);
router.get('/', getTasks);
router.get('/stats', getTaskStats);
router.get('/report', getTaskReport);
router.get('/:taskId', getTask);
router.put('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);
router.post('/:taskId/assign', assignTask);
router.post('/:taskId/status', updateStatus);
router.post('/:taskId/time', addTimeEntry);
router.post('/:taskId/comment', addComment);
router.post('/:taskId/subtask', addSubtask);
router.post('/:taskId/subtask/:index/toggle', toggleSubtask);
router.get('/:taskId/permissions', getTaskPermissions);

export default router;
