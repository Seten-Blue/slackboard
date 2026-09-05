import { Response } from 'express';
import mongoose from 'mongoose';
import AuditLog, { IAuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

// ==================== HELPER ====================

export const logAction = async (
  actorId: string,
  action: string,
  category: IAuditLog['category'],
  target?: string,
  targetType?: string,
  details?: Record<string, any>,
  ip?: string,
  userAgent?: string,
  success: boolean = true,
  errorMessage?: string
): Promise<IAuditLog | null> => {
  const actor = mongoose.isValidObjectId(actorId) ? actorId : null;
  try {
    return await AuditLog.create({
      actor,
      action,
      category,
      target: target || null,
      targetType: targetType || null,
      details: details || null,
      ip: ip || null,
      userAgent: userAgent || null,
      success,
      errorMessage: errorMessage || null,
    });
  } catch (error: any) {
    console.error('⚠️ No se pudo guardar el log de auditoria:', error.message);
    return null;
  }
};

// ==================== LIST ====================

// GET /api/audit-logs
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const {
      actor,
      category,
      action,
      target,
      startDate,
      endDate,
      success,
      page = '1',
      limit = '20',
      sort = '-createdAt',
    } = req.query;

    const filter: Record<string, any> = {};

    if (actor) filter.actor = actor;
    if (category) filter.category = category;
    if (action) filter.action = { $regex: action, $options: 'i' };
    if (target) filter.target = { $regex: target, $options: 'i' };
    if (success !== undefined) filter.success = success === 'true';

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;
    const sortDir = (sort as string).startsWith('-') ? -1 : 1;
    const sortField = (sort as string).replace(/^-/, '');

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'username avatar')
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    // Log that someone accessed the audit log itself (SOC 2 requirement)
    if (req.userId) {
      logAction(req.userId, 'audit.accessed', 'access', undefined, 'AuditLog',
        { filters: Object.keys(filter), resultCount: total },
        req.ip, req.headers['user-agent']);
    }

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo logs de auditoria', error: error.message });
  }
};

// ==================== GET SINGLE ====================

// GET /api/audit-logs/:logId
export const getAuditLog = async (req: AuthRequest, res: Response) => {
  try {
    const { logId } = req.params;

    const log = await AuditLog.findById(logId).populate('actor', 'username avatar email').lean();

    if (!log) {
      return res.status(404).json({ success: false, message: 'Log de auditoria no encontrado' });
    }

    res.json({ success: true, data: log });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo log de auditoria', error: error.message });
  }
};

// ==================== STATS ====================

// GET /api/audit-logs/stats
export const getAuditStats = async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalLogs,
      categoryBreakdown,
      actionBreakdown,
      actorBreakdown,
      failedCount,
      hourlyActivity,
    ] = await Promise.all([
      AuditLog.countDocuments(),

      AuditLog.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $project: { category: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),

      AuditLog.aggregate([
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $project: { action: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      AuditLog.aggregate([
        { $group: { _id: '$actor', count: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { userId: '$_id', username: '$user.username', avatar: '$user.avatar', count: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      AuditLog.countDocuments({ success: false }),

      AuditLog.aggregate([
        { $match: { createdAt: { $gte: twentyFourHoursAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
              hour: { $hour: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            date: {
              $dateFromParts: {
                year: '$_id.year',
                month: '$_id.month',
                day: '$_id.day',
                hour: '$_id.hour',
              },
            },
            count: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalLogs,
        categoryBreakdown,
        actionBreakdown,
        actorBreakdown,
        failedCount,
        hourlyActivity,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo estadisticas de auditoria', error: error.message });
  }
};

// ==================== USER ACTIVITY ====================

// GET /api/audit-logs/user/:userId
export const getUserActivity = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { page = '1', limit = '30' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find({ actor: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('actor', 'username avatar')
        .lean(),
      AuditLog.countDocuments({ actor: userId }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo actividad del usuario', error: error.message });
  }
};

// ==================== RECENT ACTIVITY ====================

// GET /api/audit-logs/recent
export const getRecentActivity = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '20' } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .populate('actor', 'username avatar')
      .lean();

    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo actividad reciente', error: error.message });
  }
};

// ==================== SEARCH ====================

// GET /api/audit-logs/search
export const searchLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { q, page = '1', limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ success: false, message: 'Parametro de busqueda "q" requerido' });
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const regex = { $regex: q, $options: 'i' };

    const filter = {
      $or: [
        { action: regex },
        { target: regex },
        { 'details': regex },
      ],
    };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('actor', 'username avatar')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error buscando logs de auditoria', error: error.message });
  }
};
