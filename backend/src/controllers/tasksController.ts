import { Response } from 'express';
import mongoose from 'mongoose';
import Task from '../models/Task';
import User from '../models/User';
import Channel from '../models/Channel';
import Message from '../models/Message';
import { AuthRequest } from '../middleware/auth';
import { logAction } from './auditLogController';
import discordservice from '../services/discordservice';
import slackService from '../services/slackService';

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { title, description, assignee, priority, dueDate, estimatedHours, tags, channel, subtasks, assignmentChannel } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title es requerido' });
    }

    let assigneeId: mongoose.Types.ObjectId | null = null;
    if (assignee) {
      try {
        assigneeId = new mongoose.Types.ObjectId(assignee);
        const assigneeExists = await User.findById(assigneeId).select('_id').lean();
        if (!assigneeExists) {
          return res.status(400).json({ success: false, message: 'Usuario asignado no encontrado' });
        }
      } catch {
        return res.status(400).json({ success: false, message: 'assignee debe ser un ObjectId valido' });
      }
    }

    const channelId = channel ? (() => { try { return new mongoose.Types.ObjectId(channel); } catch { return null; } })() : null;

    const user = await User.findById(userId).select('role').lean();
    const taskData: any = {
      title,
      description: description || '',
      creator: userId,
      assignee: assigneeId,
      channel: channelId,
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours: estimatedHours || null,
      tags: tags || [],
      subtasks: subtasks || [],
    };

    if (assigneeId) {
      taskData.assignedBy = userId;
      taskData.assignmentChannel = channelId;
      taskData.assignerRole = user?.role || 'member';
    }

    const task = await Task.create(taskData);

    const populated = await Task.findById(task._id)
      .populate('creator', 'username email avatar role')
      .populate('assignee', 'username email avatar')
      .populate('assignedBy', 'username email avatar role')
      .populate('channel', 'name platform')
      .populate('assignmentChannel', 'name platform');

    logAction(userId, 'task.created', 'create', task._id.toString(), 'Task',
      { title, assignee: assignee || null, priority: priority || 'medium' },
      req.ip, req.headers['user-agent']);

    const priorityEmoji: Record<string, string> = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
    const statusEmoji: Record<string, string> = { pending: '⏳', in_progress: '🔄', completed: '✅', cancelled: '❌' };
    const emoji = priorityEmoji[priority || 'medium'] || '🟡';
    const assigneeUser = assigneeId ? await User.findById(assigneeId).select('username').lean() : null;

    const taskText = [
      `${emoji} **Nueva tarea: ${title}**`,
      description ? `> ${description.substring(0, 120)}${description.length > 120 ? '...' : ''}` : '',
      `📋 Estado: ${statusEmoji['pending']} Pendiente  |  Prioridad: ${(priority || 'medium').toUpperCase()}`,
      assigneeUser ? `👤 Asignada a: **${assigneeUser.username}**` : '👤 Sin asignar',
      dueDate ? `📅 Fecha limite: ${new Date(dueDate).toLocaleDateString('es-ES')}` : '',
      `🔗 Ver en SlackBoard`,
    ].filter(Boolean).join('\n');

    const targetChannel = channelId;
    if (targetChannel) {
      const chDoc: any = await Channel.findById(targetChannel);

      const chatContent = [
        `${emoji} **Nueva tarea: ${title}**`,
        description ? `> ${description.substring(0, 120)}${description.length > 120 ? '...' : ''}` : '',
        `📋 Estado: Pendiente  |  Prioridad: ${(priority || 'medium').toUpperCase()}`,
        assigneeUser ? `👤 Asignada a: **${assigneeUser.username}**` : '👤 Sin asignar',
        dueDate ? `📅 Fecha limite: ${new Date(dueDate).toLocaleDateString('es-ES')}` : '',
      ].filter(Boolean).join('\n');

      const chatMsg = await Message.create({
        content: chatContent,
        channel: targetChannel,
        sender: userId,
        type: 'text',
      });

      const io = req.app.get('io');
      if (io) {
        const populatedMsg = await Message.findById(chatMsg._id)
          .populate('sender', 'username email avatar status role');
        io.to(targetChannel.toString()).emit('new-message', {
          channelId: targetChannel.toString(),
          message: populatedMsg,
        });
      }

      if (chDoc?.discordChannelId) {
        try {
          const discordMsgId = await discordservice.sendMessage(targetChannel.toString(), taskText);
          if (discordMsgId) {
            task.discordNotificationMessageId = discordMsgId;
            await task.save();
          }
        } catch (err: any) {
          console.warn('No se pudo enviar tarea a Discord:', err.message);
        }
      }

      if (chDoc?.slackChannelId) {
        try {
          await slackService.sendMessage(chDoc.name, taskText);
        } catch (err: any) {
          console.warn('No se pudo enviar tarea a Slack:', err.message);
        }
      }
    }

    res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error creando tarea', error: error.message });
  }
};

export const getTasks = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const { status, priority, assignee, creator, channel, tag, sortBy, sortOrder } = req.query;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const filter: any = {};

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignee) {
      try {
        filter.assignee = new mongoose.Types.ObjectId(assignee as string);
      } catch {
        const user = await User.findOne({ username: assignee }).select('_id').lean();
        if (user) filter.assignee = user._id;
      }
    }
    if (creator) {
      try {
        filter.creator = new mongoose.Types.ObjectId(creator as string);
      } catch {}
    }
    if (!assignee && !creator) filter.$or = [{ creator: userId }, { assignee: userId }];
    if (channel) {
      try {
        filter.channel = new mongoose.Types.ObjectId(channel as string);
      } catch {}
    }
    if (tag) filter.tags = tag;
    if (startDate || endDate) {
      filter.dueDate = {};
      if (startDate) filter.dueDate.$gte = new Date(startDate);
      if (endDate) filter.dueDate.$lte = new Date(endDate);
    }

    const allowedSort = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'status', 'title'];
    const sortField = allowedSort.includes(sortBy as string) ? (sortBy as string) : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    const [tasks, total] = await Promise.all([
      Task.find(filter)
        .populate('creator', 'username email avatar role')
        .populate('assignee', 'username email avatar')
        .populate('assignedBy', 'username email avatar role')
        .populate('channel', 'name platform')
        .populate('assignmentChannel', 'name platform')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('Error obteniendo tareas:', error.message);
    res.status(500).json({ success: false, message: 'Error obteniendo tareas', error: error.message });
  }
};

export const getTask = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId)
      .populate('creator', 'username email avatar role')
      .populate('assignee', 'username email avatar')
      .populate('assignedBy', 'username email avatar role')
      .populate('channel', 'name platform')
      .populate('assignmentChannel', 'name platform')
      .populate('comments.user', 'username email avatar')
      .populate('timeEntries.user', 'username email avatar')
      .lean();

    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    res.json({ success: true, data: task });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo tarea', error: error.message });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { taskId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    const user = await User.findById(userId).select('role').lean();
    const isCreator = task.creator.toString() === userId;
    const isAssignee = task.assignee?.toString() === userId;
    const isManagerOrAbove = user && ['owner', 'admin', 'manager'].includes(user.role);

    if (!isCreator && !isAssignee && !isManagerOrAbove) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para editar esta tarea' });
    }

    const allowedFields = [
      'title', 'description', 'priority', 'dueDate', 'estimatedHours',
      'tags', 'channel', 'status', 'assignee',
    ];
    const updates: any = {};
    const changes: any = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const oldVal = (task as any)[field];
        const newVal = req.body[field];
        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
          changes[field] = { before: oldVal, after: newVal };
        }
        updates[field] = req.body[field];
      }
    }

    if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);

    const updated = await Task.findByIdAndUpdate(taskId, updates, { new: true })
      .populate('creator', 'username email avatar role')
      .populate('assignee', 'username email avatar')
      .populate('assignedBy', 'username email avatar role')
      .populate('channel', 'name platform')
      .populate('assignmentChannel', 'name platform');

    if (Object.keys(changes).length > 0) {
      logAction(userId, 'task.updated', 'modify', taskId, 'Task', changes,
        req.ip, req.headers['user-agent']);
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error actualizando tarea', error: error.message });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { taskId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    const user = await User.findById(userId).select('role').lean();
    const isCreator = task.creator.toString() === userId;
    const isAdminOrAbove = user && ['owner', 'admin'].includes(user.role);
    if (!isCreator && !isAdminOrAbove) {
      return res.status(403).json({ success: false, message: 'Solo el creador o un admin pueden eliminar esta tarea' });
    }

    await Task.findByIdAndDelete(taskId);

    logAction(userId, 'task.deleted', 'delete', taskId, 'Task',
      { title: task.title },
      req.ip, req.headers['user-agent']);

    res.json({ success: true, message: 'Tarea eliminada' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error eliminando tarea', error: error.message });
  }
};

export const assignTask = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { taskId } = req.params;
    const { userId: assigneeId } = req.body;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    const user = await User.findById(userId).select('role').lean();
    const isCreator = task.creator.toString() === userId;
    const isAssignee = task.assignee?.toString() === userId;
    const isManagerOrAbove = user && ['owner', 'admin', 'manager'].includes(user.role);

    if (!isCreator && !isAssignee && !isManagerOrAbove) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para asignar esta tarea' });
    }

    if (assigneeId) {
      const assigneeExists = await User.findById(assigneeId);
      if (!assigneeExists) {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      }
    }

    const oldAssignee = task.assignee?.toString() || null;
    task.assignee = assigneeId || null;
    if (assigneeId) {
      task.assignedBy = userId;
      task.assignmentChannel = req.body.assignmentChannel || task.channel || null;
      task.assignerRole = user?.role || 'member';
    }
    await task.save();

    const populated = await Task.findById(taskId)
      .populate('creator', 'username email avatar role')
      .populate('assignee', 'username email avatar')
      .populate('assignedBy', 'username email avatar role')
      .populate('channel', 'name platform')
      .populate('assignmentChannel', 'name platform');

    if (oldAssignee !== (assigneeId || null)) {
      logAction(userId, 'task.reassigned', 'modify', taskId, 'Task',
        { before: { assignee: oldAssignee }, after: { assignee: assigneeId || null }, title: task.title },
        req.ip, req.headers['user-agent']);
    }

    res.json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error asignando tarea', error: error.message });
  }
};

export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { taskId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `status debe ser: ${validStatuses.join(', ')}` });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    const user = await User.findById(userId).select('role').lean();
    const isCreator = task.creator.toString() === userId;
    const isAssignee = task.assignee?.toString() === userId;
    const isManagerOrAbove = user && ['owner', 'admin', 'manager'].includes(user.role);

    if (!isCreator && !isAssignee && !isManagerOrAbove) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para cambiar el estado de esta tarea' });
    }

    const oldStatus = task.status;
    task.status = status;
    if (status === 'completed') {
      task.completedAt = new Date();
    } else {
      task.completedAt = undefined;
    }

    await task.save();

    if (oldStatus !== status) {
      logAction(userId, 'task.status_changed', 'modify', taskId, 'Task',
        { before: { status: oldStatus }, after: { status }, title: task.title },
        req.ip, req.headers['user-agent']);

      const statusEmoji: Record<string, string> = { pending: '⏳', in_progress: '🔄', completed: '✅', cancelled: '❌' };
      const statusText = `${statusEmoji[status] || '📋'} **${task.title}** cambió a: **${status.replace('_', ' ')}**`;
      const targetChannelId = (task as any).assignmentChannel || task.channel;
      if (targetChannelId) {
        const chatMsg = await Message.create({
          content: statusText,
          channel: targetChannelId,
          sender: userId,
          type: 'text',
        });

        const io = req.app.get('io');
        if (io) {
          const populatedMsg = await Message.findById(chatMsg._id)
            .populate('sender', 'username email avatar status role');
          io.to(targetChannelId.toString()).emit('new-message', {
            channelId: targetChannelId.toString(),
            message: populatedMsg,
          });
        }

        const chDoc: any = await Channel.findById(targetChannelId);
        if (chDoc?.discordChannelId) {
          try {
            await discordservice.sendMessage(targetChannelId.toString(), statusText);
          } catch (err: any) {
            console.warn('No se pudo notificar cambio de estado a Discord:', err.message);
          }
        }
        if (chDoc?.slackChannelId) {
          try {
            await slackService.sendMessage(chDoc.name, statusText);
          } catch (err: any) {
            console.warn('No se pudo notificar cambio de estado a Slack:', err.message);
          }
        }
      }
    }

    const populated = await Task.findById(taskId)
      .populate('creator', 'username email avatar role')
      .populate('assignee', 'username email avatar')
      .populate('assignedBy', 'username email avatar role')
      .populate('channel', 'name platform')
      .populate('assignmentChannel', 'name platform');

    res.json({ success: true, data: populated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error actualizando estado', error: error.message });
  }
};

export const addTimeEntry = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { taskId } = req.params;
    const { action, start, end, description } = req.body;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    if (action === 'stop') {
      const runningEntry = task.timeEntries.find(
        (e: any) => e.user.toString() === userId && !e.end
      );
      if (!runningEntry) {
        return res.status(400).json({ success: false, message: 'No hay temporizador activo para esta tarea' });
      }

      runningEntry.end = new Date();
      if (description) runningEntry.description = description;

      const durationMs = runningEntry.end.getTime() - runningEntry.start.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      task.actualHours += durationHours;

      await task.save();
      return res.json({ success: true, data: task });
    }

    const hasRunning = task.timeEntries.some(
      (e: any) => e.user.toString() === userId && !e.end
    );
    if (hasRunning) {
      return res.status(400).json({ success: false, message: 'Ya hay un temporizador activo. Detenlo antes de iniciar otro.' });
    }

    task.timeEntries.push({
      user: new mongoose.Types.ObjectId(userId),
      start: start ? new Date(start) : new Date(),
      end: end ? new Date(end) : undefined,
      description: description || '',
    });

    if (end) {
      const durationMs = new Date(end).getTime() - new Date(start || Date.now()).getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      task.actualHours += durationHours;
    }

    await task.save();
    res.json({ success: true, data: task });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error agregando entrada de tiempo', error: error.message });
  }
};

export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { taskId } = req.params;
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'text es requerido' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    task.comments.push({
      user: new mongoose.Types.ObjectId(userId),
      text,
      createdAt: new Date(),
    });

    await task.save();

    const populated = await Task.findById(taskId)
      .populate('comments.user', 'username email avatar');

    res.json({ success: true, data: populated.comments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error agregando comentario', error: error.message });
  }
};

export const addSubtask = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title es requerido' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    task.subtasks.push({ title, completed: false });
    await task.save();

    res.json({ success: true, data: task.subtasks });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error agregando subtarea', error: error.message });
  }
};

export const toggleSubtask = async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, index } = req.params;
    const idx = parseInt(index, 10);

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    if (isNaN(idx) || idx < 0 || idx >= task.subtasks.length) {
      return res.status(400).json({ success: false, message: 'Indice de subtarea invalido' });
    }

    task.subtasks[idx].completed = !task.subtasks[idx].completed;
    await task.save();

    res.json({ success: true, data: task.subtasks });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error actualizando subtarea', error: error.message });
  }
};

export const getTaskStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const filter = { $or: [{ creator: userId }, { assignee: userId }] };

    const [
      totalTasks,
      statusCounts,
      priorityCounts,
      overdueCount,
      avgCompletionAgg,
      tasksPerUser,
      hoursAgg,
    ] = await Promise.all([
      Task.countDocuments(filter),
      Task.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: filter },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Task.countDocuments({
        ...filter,
        dueDate: { $lt: new Date() },
        status: { $nin: ['completed', 'cancelled'] },
      }),
      Task.aggregate([
        {
          $match: {
            ...filter,
            status: 'completed',
            completedAt: { $ne: null },
            createdAt: { $ne: null },
          },
        },
        {
          $project: {
            durationMs: { $subtract: ['$completedAt', '$createdAt'] },
          },
        },
        { $group: { _id: null, avgMs: { $avg: '$durationMs' } } },
      ]),
      Task.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$assignee',
            count: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
        {
          $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            username: '$user.username',
            count: 1,
            pending: 1,
            inProgress: 1,
            completed: 1,
            _id: 0,
          },
        },
        { $sort: { count: -1 } },
      ]),
      Task.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalActualHours: { $sum: '$actualHours' },
            totalEstimatedHours: { $sum: { $ifNull: ['$estimatedHours', 0] } },
          },
        },
      ]),
    ]);

    const avgCompletionTimeMs = avgCompletionAgg[0]?.avgMs || 0;
    const avgCompletionTimeDays = Math.round(avgCompletionTimeMs / (1000 * 60 * 60 * 24) * 100) / 100;

    const statusMap: Record<string, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    statusCounts.forEach((s: any) => { statusMap[s._id] = s.count; });

    const priorityMap: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    priorityCounts.forEach((p: any) => { priorityMap[p._id] = p.count; });

    res.json({
      success: true,
      data: {
        totalTasks,
        byStatus: statusMap,
        byPriority: priorityMap,
        overdueCount,
        avgCompletionTimeDays,
        tasksPerUser,
        hoursTracked: Math.round((hoursAgg[0]?.totalActualHours || 0) * 100) / 100,
        hoursEstimated: Math.round((hoursAgg[0]?.totalEstimatedHours || 0) * 100) / 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo estadisticas', error: error.message });
  }
};

export const getTaskReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate y endDate son requeridos' });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const filter = { $or: [{ creator: userId }, { assignee: userId }] };

    const [createdPerDay, completedPerDay, overduePerDay, tasksByUser, hoursByUser] = await Promise.all([
      Task.aggregate([
        { $match: { ...filter, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]),
      Task.aggregate([
        {
          $match: {
            ...filter,
            status: 'completed',
            completedAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]),
      Task.aggregate([
        {
          $match: {
            ...filter,
            dueDate: { $gte: start, $lte: end },
            status: { $nin: ['completed', 'cancelled'] },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$dueDate' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]),
      Task.aggregate([
        { $match: { ...filter, createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: '$creator',
            created: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          },
        },
        {
          $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            username: '$user.username',
            created: 1,
            completed: 1,
            _id: 0,
          },
        },
        { $sort: { created: -1 } },
      ]),
      Task.aggregate([
        { $match: { ...filter, actualHours: { $gt: 0 } } },
        { $unwind: '$timeEntries' },
        {
          $match: {
            'timeEntries.start': { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: '$timeEntries.user',
            totalHours: {
              $sum: {
                $cond: [
                  { $ne: ['$timeEntries.end', null] },
                  {
                    $divide: [
                      { $subtract: ['$timeEntries.end', '$timeEntries.start'] },
                      3600000,
                    ],
                  },
                  0,
                ],
              },
            },
          },
        },
        {
          $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            username: '$user.username',
            totalHours: { $round: ['$totalHours', 2] },
            _id: 0,
          },
        },
        { $sort: { totalHours: -1 } },
      ]),
    ]);

    const totalCreated = createdPerDay.reduce((sum: number, d: any) => sum + d.count, 0);
    const totalCompleted = completedPerDay.reduce((sum: number, d: any) => sum + d.count, 0);
    const totalOverdue = overduePerDay.reduce((sum: number, d: any) => sum + d.count, 0);

    res.json({
      success: true,
      data: {
        dateRange: { startDate: start, endDate: end },
        summary: { totalCreated, totalCompleted, totalOverdue },
        createdPerDay,
        completedPerDay,
        overduePerDay,
        tasksByUser,
        hoursByUser,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generando reporte', error: error.message });
  }
};
