import { Response } from 'express';
import AiMetric from '../models/AiMetric';
import { AuthRequest } from '../middleware/auth';

// ==================== RECORD ====================

export const recordMetric = async (data: {
  user: string;
  channel?: string;
  modelName: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  responseTimeMs?: number;
  query?: string;
  responsePreview?: string;
  success?: boolean;
  errorMessage?: string;
  automationsTriggered?: string[];
  department?: string;
}) => {
  try {
    const inputTokens = data.inputTokens ?? 0;
    const outputTokens = data.outputTokens ?? 0;
    const totalTokens = data.totalTokens ?? inputTokens + outputTokens;

    const metric = await AiMetric.create({
      user: data.user,
      channel: data.channel ?? null,
      model: data.modelName,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: data.costUsd ?? 0,
      responseTimeMs: data.responseTimeMs ?? 0,
      query: data.query ?? '',
      responsePreview: data.responsePreview ?? '',
      success: data.success !== undefined ? data.success : true,
      errorMessage: data.errorMessage ?? null,
      automationsTriggered: data.automationsTriggered ?? [],
      department: data.department ?? null,
    });

    return metric;
  } catch (error: any) {
    console.error('Error recording AI metric:', error.message);
    return null;
  }
};

// ==================== LIST ====================

export const getMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      user,
      channel,
      model,
      startDate,
      endDate,
      success,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const filter: any = {};

    if (user) filter.user = user;
    else filter.user = userId;

    if (channel) filter.channel = channel;
    if (model) filter.model = model;
    if (success !== undefined) filter.success = success === 'true';

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    const [metrics, total] = await Promise.all([
      AiMetric.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('user', 'username avatar')
        .populate('channel', 'name platform')
        .lean(),
      AiMetric.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        metrics,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo metricas', error: error.message });
  }
};

// ==================== STATS ====================

export const getMetricStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate, user, channel, model } = req.query as Record<string, string>;

    const filter: any = {};
    if (user) filter.user = user;
    else filter.user = userId;
    if (channel) filter.channel = channel;
    if (model) filter.model = model;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [
      totalsAgg,
      byModel,
      byUser,
      byDepartment,
      successRateAgg,
      tokensPerDay,
      costPerDay,
      queriesPerHour,
      topAutomations,
    ] = await Promise.all([
      // Total queries, tokens, cost, avg response time
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalQueries: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCostUsd: { $sum: '$costUsd' },
            avgResponseTimeMs: { $avg: '$responseTimeMs' },
          },
        },
      ]),

      // Queries by model
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$model',
            count: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCostUsd: { $sum: '$costUsd' },
            avgResponseTimeMs: { $avg: '$responseTimeMs' },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Queries by user
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$user',
            count: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCostUsd: { $sum: '$costUsd' },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
        { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            username: '$userInfo.username',
            count: 1,
            totalTokens: 1,
            totalCostUsd: 1,
            _id: 0,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),

      // Queries by department
      AiMetric.aggregate([
        { $match: { ...filter, department: { $ne: null } } },
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCostUsd: { $sum: '$costUsd' },
          },
        },
        { $sort: { count: -1 } },
      ]),

      // Success rate
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$success',
            count: { $sum: 1 },
          },
        },
      ]),

      // Tokens per day (last 30 days)
      AiMetric.aggregate([
        {
          $match: {
            ...filter,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ...(filter.createdAt ?? {}),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            tokens: { $sum: '$totalTokens' },
            queries: { $sum: 1 },
          },
        },
        {
          $project: {
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            tokens: 1,
            queries: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Cost per day (last 30 days)
      AiMetric.aggregate([
        {
          $match: {
            ...filter,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ...(filter.createdAt ?? {}),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            cost: { $sum: '$costUsd' },
            queries: { $sum: 1 },
          },
        },
        {
          $project: {
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            cost: { $round: ['$cost', 6] },
            queries: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Queries per hour heatmap (last 30 days)
      AiMetric.aggregate([
        {
          $match: {
            ...filter,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ...(filter.createdAt ?? {}),
            },
          },
        },
        {
          $project: {
            hour: { $hour: '$createdAt' },
            dayOfWeek: { $dayOfWeek: '$createdAt' },
          },
        },
        { $group: { _id: { hour: '$hour', day: '$dayOfWeek' }, count: { $sum: 1 } } },
        { $project: { hour: '$_id.hour', day: '$_id.day', count: 1, _id: 0 } },
      ]),

      // Top automations triggered
      AiMetric.aggregate([
        { $match: filter },
        { $unwind: { path: '$automationsTriggered', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: '$automationsTriggered',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ]),
    ]);

    const totals = totalsAgg[0] || {
      totalQueries: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgResponseTimeMs: 0,
    };

    const successCount = successRateAgg.find((s) => s._id === true)?.count || 0;
    const failCount = successRateAgg.find((s) => s._id === false)?.count || 0;
    const totalForRate = successCount + failCount;

    res.json({
      success: true,
      data: {
        totals: {
          ...totals,
          avgResponseTimeMs: Math.round(totals.avgResponseTimeMs),
          totalCostUsd: parseFloat(totals.totalCostUsd.toFixed(6)),
        },
        successRate: totalForRate > 0 ? parseFloat(((successCount / totalForRate) * 100).toFixed(2)) : 100,
        successCount,
        failCount,
        queriesByModel: byModel.map((m) => ({
          model: m._id,
          count: m.count,
          totalTokens: m.totalTokens,
          totalCostUsd: parseFloat(m.totalCostUsd.toFixed(6)),
          avgResponseTimeMs: Math.round(m.avgResponseTimeMs),
        })),
        queriesByUser: byUser,
        queriesByDepartment: byDepartment.map((d) => ({
          department: d._id,
          count: d.count,
          totalTokens: d.totalTokens,
          totalCostUsd: parseFloat(d.totalCostUsd.toFixed(6)),
        })),
        tokensPerDay,
        costPerDay,
        queriesPerHour,
        topAutomations,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo estadisticas de IA', error: error.message });
  }
};

// ==================== DEPARTMENTS ====================

export const getUsageByDepartment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query as Record<string, string>;

    const filter: any = { user: userId, department: { $ne: null } };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const departments = await AiMetric.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$department',
          totalQueries: { $sum: 1 },
          totalTokens: { $sum: '$totalTokens' },
          totalCostUsd: { $sum: '$costUsd' },
          avgResponseTimeMs: { $avg: '$responseTimeMs' },
          successCount: {
            $sum: { $cond: ['$success', 1, 0] },
          },
          models: { $addToSet: '$model' },
          lastUsed: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          department: '$_id',
          totalQueries: 1,
          totalTokens: 1,
          totalCostUsd: { $round: ['$totalCostUsd', 6] },
          avgResponseTimeMs: { $round: ['$avgResponseTimeMs', 0] },
          successRate: {
            $cond: [
              { $eq: ['$totalQueries', 0] },
              100,
              { $round: [{ $multiply: [{ $divide: ['$successCount', '$totalQueries'] }, 100] }, 2] },
            ],
          },
          models: 1,
          lastUsed: 1,
          _id: 0,
        },
      },
      { $sort: { totalQueries: -1 } },
    ]);

    res.json({ success: true, data: departments });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo uso por departamento', error: error.message });
  }
};

// ==================== COST REPORT ====================

export const getCostReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate, period = 'day' } = req.query as Record<string, string>;

    const filter: any = { user: userId };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const groupByPeriod = period === 'month'
      ? { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }
      : period === 'hour'
        ? { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' }, hour: { $hour: '$createdAt' } }
        : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };

    const [totalCost, byModel, byUser, byDepartment, overTime, topExpensive] = await Promise.all([
      // Total cost
      AiMetric.aggregate([
        { $match: filter },
        { $group: { _id: null, totalCostUsd: { $sum: '$costUsd' }, totalQueries: { $sum: 1 } } },
      ]),

      // Cost by model
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$model',
            totalCostUsd: { $sum: '$costUsd' },
            queries: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
          },
        },
        {
          $project: {
            model: '$_id',
            totalCostUsd: { $round: ['$totalCostUsd', 6] },
            queries: 1,
            totalTokens: 1,
            costPerQuery: {
              $cond: [
                { $eq: ['$queries', 0] },
                0,
                { $round: [{ $divide: ['$totalCostUsd', '$queries'] }, 8] },
              ],
            },
            _id: 0,
          },
        },
        { $sort: { totalCostUsd: -1 } },
      ]),

      // Cost by user
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$user',
            totalCostUsd: { $sum: '$costUsd' },
            queries: { $sum: 1 },
          },
        },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
        { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            userId: '$_id',
            username: '$userInfo.username',
            totalCostUsd: { $round: ['$totalCostUsd', 6] },
            queries: 1,
            _id: 0,
          },
        },
        { $sort: { totalCostUsd: -1 } },
      ]),

      // Cost by department
      AiMetric.aggregate([
        { $match: { ...filter, department: { $ne: null } } },
        {
          $group: {
            _id: '$department',
            totalCostUsd: { $sum: '$costUsd' },
            queries: { $sum: 1 },
          },
        },
        {
          $project: {
            department: '$_id',
            totalCostUsd: { $round: ['$totalCostUsd', 6] },
            queries: 1,
            _id: 0,
          },
        },
        { $sort: { totalCostUsd: -1 } },
      ]),

      // Cost over time
      AiMetric.aggregate([
        { $match: filter },
        { $group: { _id: groupByPeriod, cost: { $sum: '$costUsd' }, queries: { $sum: 1 } } },
        {
          $project: {
            date: { $dateFromParts: groupByPeriod },
            cost: { $round: ['$cost', 6] },
            queries: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Top 10 most expensive individual queries
      AiMetric.find(filter)
        .sort({ costUsd: -1 })
        .limit(10)
        .populate('user', 'username')
        .select('model costUsd totalTokens responseTimeMs query createdAt')
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        totalCostUsd: totalCost[0] ? parseFloat(totalCost[0].totalCostUsd.toFixed(6)) : 0,
        totalQueries: totalCost[0]?.totalQueries ?? 0,
        byModel,
        byUser,
        byDepartment,
        overTime,
        topExpensive,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generando reporte de costos', error: error.message });
  }
};

// ==================== PERFORMANCE REPORT ====================

export const getPerformanceReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query as Record<string, string>;

    const filter: any = { user: userId };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timelineFilter = {
      ...filter,
      createdAt: {
        $gte: filter.createdAt?.$gte ? (filter.createdAt.$gte > thirtyDaysAgo ? filter.createdAt.$gte : thirtyDaysAgo) : thirtyDaysAgo,
        ...(filter.createdAt?.$lte ? { $lte: filter.createdAt.$lte } : {}),
      },
    };

    const [overall, responseTimesOverTime, successRateOverTime, tokenEfficiency, byModel] = await Promise.all([
      // Overall performance
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalQueries: { $sum: 1 },
            avgResponseTimeMs: { $avg: '$responseTimeMs' },

            avgInputTokens: { $avg: '$inputTokens' },
            avgOutputTokens: { $avg: '$outputTokens' },
            avgTotalTokens: { $avg: '$totalTokens' },
            successCount: { $sum: { $cond: ['$success', 1, 0] } },
            failCount: { $sum: { $cond: ['$success', 0, 1] } },
          },
        },
      ]),

      // Response times over time (daily)
      AiMetric.aggregate([
        { $match: timelineFilter },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
            avgResponseTimeMs: { $avg: '$responseTimeMs' },
            p90ResponseTimeMs: { $max: '$responseTimeMs' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            avgResponseTimeMs: { $round: ['$avgResponseTimeMs', 0] },
            p90ResponseTimeMs: { $round: ['$p90ResponseTimeMs', 0] },
            count: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Success rate over time
      AiMetric.aggregate([
        { $match: timelineFilter },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
            total: { $sum: 1 },
            success: { $sum: { $cond: ['$success', 1, 0] } },
          },
        },
        {
          $project: {
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            total: 1,
            success: 1,
            successRate: {
              $cond: [
                { $eq: ['$total', 0] },
                100,
                { $round: [{ $multiply: [{ $divide: ['$success', '$total'] }, 100] }, 2] },
              ],
            },
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Token efficiency over time (output / input ratio)
      AiMetric.aggregate([
        { $match: { ...timelineFilter, inputTokens: { $gt: 0 } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
            avgInputTokens: { $avg: '$inputTokens' },
            avgOutputTokens: { $avg: '$outputTokens' },
            avgTotalTokens: { $avg: '$totalTokens' },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            avgInputTokens: { $round: ['$avgInputTokens', 0] },
            avgOutputTokens: { $round: ['$avgOutputTokens', 0] },
            avgTotalTokens: { $round: ['$avgTotalTokens', 0] },
            efficiencyRatio: {
              $round: [{ $cond: [{ $eq: ['$avgInputTokens', 0] }, 0, { $divide: ['$avgOutputTokens', '$avgInputTokens'] }] }, 3],
            },
            count: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),

      // Performance by model
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$model',
            count: { $sum: 1 },
            avgResponseTimeMs: { $avg: '$responseTimeMs' },
            avgInputTokens: { $avg: '$inputTokens' },
            avgOutputTokens: { $avg: '$outputTokens' },
            avgTotalTokens: { $avg: '$totalTokens' },
            successCount: { $sum: { $cond: ['$success', 1, 0] } },
          },
        },
        {
          $project: {
            model: '$_id',
            count: 1,
            avgResponseTimeMs: { $round: ['$avgResponseTimeMs', 0] },
            avgInputTokens: { $round: ['$avgInputTokens', 0] },
            avgOutputTokens: { $round: ['$avgOutputTokens', 0] },
            avgTotalTokens: { $round: ['$avgTotalTokens', 0] },
            successRate: {
              $cond: [
                { $eq: ['$count', 0] },
                100,
                { $round: [{ $multiply: [{ $divide: ['$successCount', '$count'] }, 100] }, 2] },
              ],
            },
            _id: 0,
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    const stats = overall[0] || {
      totalQueries: 0,
      avgResponseTimeMs: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      avgTotalTokens: 0,
      successCount: 0,
      failCount: 0,
    };

    res.json({
      success: true,
      data: {
        overall: {
          totalQueries: stats.totalQueries,
          avgResponseTimeMs: Math.round(stats.avgResponseTimeMs),
          avgInputTokens: Math.round(stats.avgInputTokens),
          avgOutputTokens: Math.round(stats.avgOutputTokens),
          avgTotalTokens: Math.round(stats.avgTotalTokens),
          successRate:
            stats.totalQueries > 0
              ? parseFloat(((stats.successCount / stats.totalQueries) * 100).toFixed(2))
              : 100,
        },
        responseTimesOverTime,
        successRateOverTime,
        tokenEfficiency,
        byModel,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error generando reporte de rendimiento', error: error.message });
  }
};

// ==================== MODEL COMPARISON ====================

export const getModelComparison = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate } = req.query as Record<string, string>;

    const filter: any = { user: userId };
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [byModel, trendPerModel] = await Promise.all([
      // Aggregate stats per model
      AiMetric.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$model',
            totalQueries: { $sum: 1 },
            totalInputTokens: { $sum: '$inputTokens' },
            totalOutputTokens: { $sum: '$outputTokens' },
            totalTokens: { $sum: '$totalTokens' },
            totalCostUsd: { $sum: '$costUsd' },
            avgResponseTimeMs: { $avg: '$responseTimeMs' },
            avgInputTokens: { $avg: '$inputTokens' },
            avgOutputTokens: { $avg: '$outputTokens' },
            successCount: { $sum: { $cond: ['$success', 1, 0] } },
            avgTokensPerQuery: { $avg: '$totalTokens' },
          },
        },
        {
          $project: {
            model: '$_id',
            totalQueries: 1,
            totalInputTokens: 1,
            totalOutputTokens: 1,
            totalTokens: 1,
            totalCostUsd: { $round: ['$totalCostUsd', 6] },
            avgResponseTimeMs: { $round: ['$avgResponseTimeMs', 0] },
            avgInputTokens: { $round: ['$avgInputTokens', 0] },
            avgOutputTokens: { $round: ['$avgOutputTokens', 0] },
            avgTokensPerQuery: { $round: ['$avgTokensPerQuery', 0] },
            successRate: {
              $cond: [
                { $eq: ['$totalQueries', 0] },
                100,
                { $round: [{ $multiply: [{ $divide: ['$successCount', '$totalQueries'] }, 100] }, 2] },
              ],
            },
            costPerQuery: {
              $cond: [
                { $eq: ['$totalQueries', 0] },
                0,
                { $round: [{ $divide: ['$totalCostUsd', '$totalQueries'] }, 8] },
              ],
            },
            efficiencyRatio: {
              $cond: [
                { $eq: ['$totalInputTokens', 0] },
                0,
                { $round: [{ $divide: ['$totalOutputTokens', '$totalInputTokens'] }, 3] },
              ],
            },
            _id: 0,
          },
        },
        { $sort: { totalQueries: -1 } },
      ]),

      // Queries per model over time (daily)
      AiMetric.aggregate([
        {
          $match: {
            ...filter,
            createdAt: {
              $gte: filter.createdAt?.$gte ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              ...(filter.createdAt?.$lte ? { $lte: filter.createdAt.$lte } : {}),
            },
          },
        },
        {
          $group: {
            _id: {
              model: '$model',
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            queries: { $sum: 1 },
            tokens: { $sum: '$totalTokens' },
            cost: { $sum: '$costUsd' },
          },
        },
        {
          $project: {
            model: '$_id.model',
            date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
            queries: 1,
            tokens: 1,
            cost: { $round: ['$cost', 6] },
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]),
    ]);

    res.json({ success: true, data: { models: byModel, trendPerModel } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error comparando modelos', error: error.message });
  }
};
