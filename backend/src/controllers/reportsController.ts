import mongoose, { Schema, Document } from 'mongoose';
import { Response } from 'express';
import crypto from 'crypto';
import Message from '../models/Message';
import Channel from '../models/Channel';
import User from '../models/User';
import Task from '../models/Task';
import Survey from '../models/Survey';
import AiMetric from '../models/AiMetric';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { logAction } from './auditLogController';

// ==================== MODELS (Report / ScheduledReport) ====================

export interface IReport extends Document {
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  reportCategory: 'executive' | 'productivity' | 'engagement' | 'ai' | 'security' | 'full';
  createdBy: mongoose.Types.ObjectId;
  dateRange: { start: Date; end: Date };
  filters: {
    platforms: string[];
    channels: mongoose.Types.ObjectId[];
    users: mongoose.Types.ObjectId[];
  };
  data: any;
  status: 'pending' | 'completed' | 'failed';
  signature?: { hash: string; timestamp: Date; signedBy: string };
  sharedWith: { user: mongoose.Types.ObjectId; permission: 'view' | 'edit' }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IScheduledReport extends Document {
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  reportCategory: string;
  createdBy: mongoose.Types.ObjectId;
  dateRange: { start: Date; end: Date };
  filters: { platforms: string[]; channels: mongoose.Types.ObjectId[]; users: mongoose.Types.ObjectId[] };
  schedule: { frequency: string; time: string; dayOfWeek?: number; dayOfMonth?: number };
  nextGeneration: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'custom'],
      required: true,
    },
    reportCategory: {
      type: String,
      enum: ['executive', 'productivity', 'engagement', 'ai', 'security', 'full'],
      default: 'full',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    filters: {
      platforms: { type: [String], default: [] },
      channels: { type: [Schema.Types.ObjectId], ref: 'Channel', default: [] },
      users: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    },
    data: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    signature: {
      hash: { type: String, default: null },
      timestamp: { type: Date, default: null },
      signedBy: { type: String, default: null },
    },
    sharedWith: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        permission: { type: String, enum: ['view', 'edit'], default: 'view' },
      },
    ],
  },
  { timestamps: true }
);

const ScheduledReportSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'custom'],
      required: true,
    },
    reportCategory: { type: String, default: 'full' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    filters: {
      platforms: { type: [String], default: [] },
      channels: { type: [Schema.Types.ObjectId], ref: 'Channel', default: [] },
      users: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    },
    schedule: {
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
      time: { type: String, default: '09:00' },
      dayOfWeek: { type: Number, min: 0, max: 6, default: null },
      dayOfMonth: { type: Number, min: 1, max: 31, default: null },
    },
    nextGeneration: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Report = mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);
export const ScheduledReport =
  mongoose.models.ScheduledReport ||
  mongoose.model<IScheduledReport>('ScheduledReport', ScheduledReportSchema);

// ==================== HELPERS ====================

async function getUserChannelIds(userId: string): Promise<mongoose.Types.ObjectId[]> {
  const channels = await Channel.find({ members: userId }).select('_id').lean();
  return channels.map((c: any) => c._id);
}

function computePercentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

async function generateReportData(
  userId: string,
  dateRange: { start: Date; end: Date },
  filters: { platforms: string[]; channels: string[]; users: string[] },
  reportCategory: string = 'full',
  params: Record<string, any> = {}
): Promise<any> {
  const userChannelIds = await getUserChannelIds(userId);
  const matchStage: any = {
    channel: { $in: userChannelIds },
    createdAt: { $gte: dateRange.start, $lte: dateRange.end },
  };

  if (filters.channels?.length) {
    matchStage.channel = { $in: userChannelIds.filter((id) => filters.channels.includes(id.toString())) };
  }
  if (filters.users?.length) {
    matchStage.sender = { $in: filters.users };
  }
  if (filters.platforms?.length) {
    const platformChannels = await Channel.find({ _id: { $in: userChannelIds }, platform: { $in: filters.platforms } }).select('_id').lean();
    matchStage.channel = { $in: platformChannels.map((c: any) => c._id) };
  }

  const data: any = {};
  const cat = reportCategory || 'full';
  const includeMessages = cat === 'full' || cat === 'executive' || cat === 'engagement';
  const includeTasks = cat === 'full' || cat === 'executive' || cat === 'productivity';
  const includeSurveys = cat === 'full' || cat === 'engagement';
  const includeAi = cat === 'full' || cat === 'ai';
  const includeAudit = cat === 'full' || cat === 'security';

  if (includeMessages) {
    const [totalMessages, uniqueSendersAgg, totalChannelsCount, activeChannelsAgg] = await Promise.all([
      Message.countDocuments(matchStage),
      Message.aggregate([{ $match: matchStage }, { $group: { _id: '$sender' } }, { $count: 'total' }]),
      Channel.countDocuments({ _id: { $in: userChannelIds } }),
      Message.aggregate([{ $match: matchStage }, { $group: { _id: '$channel' } }, { $count: 'total' }]),
    ]);
    const totalUniqueSenders = uniqueSendersAgg[0]?.total || 0;
    const activeChannels = activeChannelsAgg[0]?.total || 0;

    const messagesPerDay = await Message.aggregate([
      { $match: matchStage },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $project: { date: '$_id', count: 1, _id: 0 } },
      { $sort: { date: 1 } },
    ]);

    const topChannels = await Message.aggregate([
      { $match: matchStage },
      { $group: { _id: '$channel', count: { $sum: 1 } } },
      { $lookup: { from: 'channels', localField: '_id', foreignField: '_id', as: 'ch' } },
      { $unwind: '$ch' },
      { $project: { name: '$ch.name', platform: '$ch.platform', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const topUsers = await Message.aggregate([
      { $match: matchStage },
      { $group: { _id: '$sender', messageCount: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $project: { username: '$u.username', messageCount: 1, _id: 0 } },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
    ]);

    const hourlyActivity = await Message.aggregate([
      { $match: matchStage },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $project: { hour: '$_id', count: 1, _id: 0 } },
      { $sort: { hour: 1 } },
    ]);

    const messagesPerUser = totalUniqueSenders > 0 ? Math.round((totalMessages / totalUniqueSenders) * 100) / 100 : 0;
    const channelActivityRate = totalChannelsCount > 0 ? Math.round((activeChannels / totalChannelsCount) * 10000) / 100 : 0;

    data.messages = {
      total: totalMessages,
      uniqueSenders: totalUniqueSenders,
      totalChannels: totalChannelsCount,
      activeChannels,
      messagesPerDay,
      topChannels,
      topUsers,
      hourlyActivity,
      messagesPerUser,
      channelActivityRate,
    };
  }

  if (includeTasks) {
    const taskChannelIds = userChannelIds.map(id => id.toString());

    const taskMatch: any = {
      $or: [
        { channel: { $in: userChannelIds } },
        { creator: userId },
        { assignee: userId },
      ],
    };

    if (filters.channels?.length) {
      const filteredChannelIds = userChannelIds.filter(id => filters.channels.includes(id.toString()));
      taskMatch.$or = [
        { channel: { $in: filteredChannelIds } },
        { creator: userId },
        { assignee: userId },
      ];
    }
    if (filters.users?.length) {
      taskMatch.$or = [
        { creator: { $in: filters.users } },
        { assignee: { $in: filters.users } },
        { channel: { $in: userChannelIds } },
      ];
    }

    const dateMatch = {
      $or: [
        { createdAt: { $gte: dateRange.start, $lte: dateRange.end } },
        { updatedAt: { $gte: dateRange.start, $lte: dateRange.end } },
        { status: { $in: ['pending', 'in_progress'] } },
      ]
    };

    const fullTaskMatch = { $and: [taskMatch, dateMatch] };

    const wantStatusBreakdown = params.statusBreakdown !== false;
    const wantPriorityAnalysis = params.priorityAnalysis !== false;
    const wantAssigneeStats = params.assigneeStats !== false;
    const wantOverdueAnalysis = params.overdueAnalysis !== false;
    const wantHoursTracking = params.hoursTracking !== false;

    const aggs: Promise<any>[] = [
      Task.countDocuments(fullTaskMatch),
      wantStatusBreakdown ? Task.aggregate([{ $match: fullTaskMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]) : Promise.resolve([]),
      wantPriorityAnalysis ? Task.aggregate([{ $match: fullTaskMatch }, { $group: { _id: '$priority', count: { $sum: 1 } } }]) : Promise.resolve([]),
      wantOverdueAnalysis ? Task.countDocuments({ ...fullTaskMatch, dueDate: { $lt: new Date() }, status: { $nin: ['completed', 'cancelled'] } }) : Promise.resolve(0),
      Task.countDocuments({ ...fullTaskMatch, status: 'completed' }),
      Task.aggregate([
        { $match: { ...fullTaskMatch, status: 'completed', completedAt: { $ne: null }, createdAt: { $ne: null } } },
        { $project: { durationMs: { $subtract: ['$completedAt', '$createdAt'] } } },
        { $group: { _id: null, avgMs: { $avg: '$durationMs' } } },
      ]),
      wantAssigneeStats ? Task.aggregate([
        { $match: fullTaskMatch },
        { $group: { _id: '$assignee', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { username: '$user.username', count: 1, completed: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]) : Promise.resolve([]),
      wantHoursTracking ? Task.aggregate([
        { $match: { ...fullTaskMatch, actualHours: { $gt: 0 } } },
        { $group: { _id: null, totalActual: { $sum: '$actualHours' }, totalEstimated: { $sum: { $ifNull: ['$estimatedHours', 0] } } } },
      ]) : Promise.resolve([]),
      Task.aggregate([
        { $match: fullTaskMatch },
        { $unwind: { path: '$subtasks', preserveNullAndEmptyArrays: false } },
        { $group: {
          _id: null,
          totalSubtasks: { $sum: 1 },
          completedSubtasks: { $sum: { $cond: ['$subtasks.completed', 1, 0] } }
        }}
      ]),
      Task.aggregate([
        { $match: fullTaskMatch },
        { $lookup: { from: 'channels', localField: 'channel', foreignField: '_id', as: 'channelInfo' } },
        { $unwind: { path: '$channelInfo', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'users', localField: 'assignee', foreignField: '_id', as: 'assigneeInfo' } },
        { $unwind: { path: '$assigneeInfo', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'users', localField: 'creator', foreignField: '_id', as: 'creatorInfo' } },
        { $unwind: { path: '$creatorInfo', preserveNullAndEmptyArrays: true } },
        { $project: {
          title: 1, status: 1, priority: 1, dueDate: 1, createdAt: 1, completedAt: 1,
          actualHours: 1, estimatedHours: 1,
          channelName: '$channelInfo.name',
          assigneeName: '$assigneeInfo.username',
          creatorName: '$creatorInfo.username',
          subtaskTotal: { $size: { $ifNull: ['$subtasks', []] } },
          subtaskCompleted: {
            $size: {
              $filter: { input: { $ifNull: ['$subtasks', []] }, as: 'st', cond: { $eq: ['$$st.completed', true] } }
            }
          },
          commentCount: { $size: { $ifNull: ['$comments', []] } },
        }},
        { $sort: { createdAt: -1 } },
        { $limit: 50 },
      ]),
    ];

    const [totalTasks, taskStatusCounts, taskPriorityCounts, overdueTasks, completedTasks, avgCompletionAgg, tasksByUserAgg, hoursAgg, subtaskAgg, taskListAgg] = await Promise.all(aggs);

    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 10000) / 100 : 0;
    const avgCompletionTimeDays = avgCompletionAgg[0]?.avgMs ? Math.round(avgCompletionAgg[0].avgMs / (1000 * 60 * 60 * 24) * 100) / 100 : 0;

    const taskStatusMap: Record<string, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    taskStatusCounts.forEach((s: any) => { taskStatusMap[s._id] = s.count; });
    const taskPriorityMap: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    taskPriorityCounts.forEach((p: any) => { taskPriorityMap[p._id] = p.count; });

    data.tasks = {
      total: totalTasks,
      completed: completedTasks,
      overdue: wantOverdueAnalysis ? overdueTasks : 0,
      completionRate: taskCompletionRate,
      avgCompletionTimeDays,
      byStatus: wantStatusBreakdown ? taskStatusMap : undefined,
      byPriority: wantPriorityAnalysis ? taskPriorityMap : undefined,
      byUser: wantAssigneeStats ? tasksByUserAgg : [],
      hoursTracked: wantHoursTracking ? Math.round((hoursAgg[0]?.totalActual || 0) * 100) / 100 : 0,
      hoursEstimated: wantHoursTracking ? Math.round((hoursAgg[0]?.totalEstimated || 0) * 100) / 100 : 0,
      subtasks: {
        total: subtaskAgg[0]?.totalSubtasks || 0,
        completed: subtaskAgg[0]?.completedSubtasks || 0,
      },
      taskList: taskListAgg || [],
    };
  }

  let totalSurveys = 0;
  let totalAiQueries = 0;
  let failedLogins = 0;
  let taskCompletionRate = 0;
  let totalUniqueSenders = 0;
  let messagesPerUser = 0;
  let tasksByUserAgg: any[] = [];

  if (includeSurveys) {
    const surveyMatch: any = {
      $or: [
        { channel: { $in: userChannelIds } },
        { creator: userId },
      ],
      createdAt: { $gte: dateRange.start, $lte: dateRange.end },
    };
    if (filters.users?.length) {
      surveyMatch.$or = [
        { creator: { $in: filters.users } },
        { channel: { $in: userChannelIds } },
      ];
    }
    if (filters.channels?.length) {
      const filteredChannelIds = userChannelIds.filter(id => filters.channels.includes(id.toString()));
      surveyMatch.$or = [
        { channel: { $in: filteredChannelIds } },
        { creator: { $in: filters.users || [userId] } },
      ];
    }

    const [totalSurveysCount, surveyStatusCounts, totalResponses, avgScoreAgg] = await Promise.all([
      Survey.countDocuments(surveyMatch),
      Survey.aggregate([{ $match: surveyMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Survey.aggregate([
        { $match: surveyMatch },
        { $project: { responseCount: { $size: { $ifNull: ['$responses', []] } } } },
        { $group: { _id: null, total: { $sum: '$responseCount' } } },
      ]),
      Survey.aggregate([
        { $match: surveyMatch },
        { $unwind: { path: '$responses', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$responses.answers', preserveNullAndEmptyArrays: true } },
        { $match: { 'answers.value': { $exists: true, $ne: null } } },
        { $group: { _id: null, avgScore: { $avg: { $toDouble: '$answers.value' } } } },
      ]),
    ]);

    totalSurveys = totalSurveysCount;
    const surveyStatusMap: Record<string, number> = { draft: 0, active: 0, closed: 0 };
    surveyStatusCounts.forEach((s: any) => { surveyStatusMap[s._id] = s.count; });

    data.surveys = {
      total: totalSurveys,
      byStatus: surveyStatusMap,
      totalResponses: totalResponses[0]?.total || 0,
      avgScore: avgScoreAgg[0]?.avgScore ? Math.round(avgScoreAgg[0].avgScore * 100) / 100 : null,
    };
  }

  if (includeAi) {
    const aiMatch: any = { createdAt: { $gte: dateRange.start, $lte: dateRange.end } };
    if (filters.users?.length) {
      aiMatch.user = { $in: filters.users };
    }

    const [totalAiQueriesCount, aiByModel, aiCostAgg, aiPerformanceAgg] = await Promise.all([
      AiMetric.countDocuments(aiMatch),
      AiMetric.aggregate([{ $match: aiMatch }, { $group: { _id: '$modelName', count: { $sum: 1 }, totalTokens: { $sum: '$totalTokens' }, totalCost: { $sum: '$costUsd' } } }, { $sort: { count: -1 } }]),
      AiMetric.aggregate([{ $match: aiMatch }, { $group: { _id: null, totalCost: { $sum: '$costUsd' }, totalTokens: { $sum: '$totalTokens' } } }]),
      AiMetric.aggregate([{ $match: aiMatch }, { $group: { _id: null, avgResponseTime: { $avg: '$responseTimeMs' }, successRate: { $avg: { $cond: ['$success', 1, 0] } } } }]),
    ]);

    totalAiQueries = totalAiQueriesCount;

    data.ai = {
      totalQueries: totalAiQueries,
      byModel: aiByModel,
      totalCost: Math.round((aiCostAgg[0]?.totalCost || 0) * 10000) / 10000,
      totalTokens: aiCostAgg[0]?.totalTokens || 0,
      avgResponseTime: aiPerformanceAgg[0]?.avgResponseTime ? Math.round(aiPerformanceAgg[0].avgResponseTime) : 0,
      successRate: aiPerformanceAgg[0]?.successRate ? Math.round(aiPerformanceAgg[0].successRate * 100) : 100,
    };
  }

  if (includeAudit) {
    const auditMatch: any = { createdAt: { $gte: dateRange.start, $lte: dateRange.end } };
    const [totalAuditEvents, failedLoginsCount, permissionChanges, auditByCategory] = await Promise.all([
      AuditLog.countDocuments(auditMatch),
      AuditLog.countDocuments({ ...auditMatch, action: 'login.failed' }),
      AuditLog.countDocuments({ ...auditMatch, category: 'permissions' }),
      AuditLog.aggregate([{ $match: auditMatch }, { $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    failedLogins = failedLoginsCount;

    data.audit = {
      totalEvents: totalAuditEvents,
      failedLogins,
      permissionChanges,
      byCategory: auditByCategory,
    };
  }

  if (includeMessages && data.messages) {
    totalUniqueSenders = data.messages.uniqueSenders || 0;
    messagesPerUser = data.messages.messagesPerUser || 0;
  }
  if (includeTasks && data.tasks) {
    taskCompletionRate = data.tasks.completionRate || 0;
    tasksByUserAgg = data.tasks.byUser || [];
  }

  const activeUsers = Math.max(totalUniqueSenders, tasksByUserAgg.length);
  data.kpis = {
    activeUsers,
    messagesPerUser,
    taskCompletionRate,
    surveyResponseRate: totalSurveys > 0 ? Math.round(((data.surveys?.totalResponses || 0) / Math.max(totalSurveys, 1)) * 100) / 100 : 0,
    aiAdoptionRate: activeUsers > 0 ? Math.round((totalAiQueries > 0 ? 1 : 0) * 100) : 0,
    securityScore: failedLogins > 5 ? 'attention' : 'healthy',
  };

  return data;
}

function calculateNextGeneration(schedule: {
  frequency: string;
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
}): Date {
  const now = new Date();
  const [hours, minutes] = schedule.time.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  if (schedule.frequency === 'weekly' && schedule.dayOfWeek != null) {
    const currentDay = next.getDay();
    let daysUntil = schedule.dayOfWeek - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    next.setDate(next.getDate() + daysUntil);
  }

  if (schedule.frequency === 'monthly' && schedule.dayOfMonth != null) {
    next.setDate(schedule.dayOfMonth);
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next;
}

// ==================== CONTROLLERS ====================

export const createReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { title, description, type, dateRange, filters, reportCategory, params } = req.body;

    if (!title || !type || !dateRange?.start || !dateRange?.end) {
      return res
        .status(400)
        .json({ success: false, message: 'title, type, dateRange.start y dateRange.end son requeridos' });
    }

    const parsedDateRange = { start: new Date(dateRange.start), end: new Date(dateRange.end) };
    const reportData = await generateReportData(userId, parsedDateRange, filters || {}, reportCategory || 'full', params || {});

    const report = await Report.create({
      title,
      description: description || '',
      type,
      reportCategory: reportCategory || 'full',
      createdBy: userId,
      dateRange: parsedDateRange,
      filters: filters || { platforms: [], channels: [], users: [] },
      data: reportData,
      status: 'completed',
    });

    logAction(userId, 'report.created', 'create', report._id.toString(), 'Report',
      { title, type, reportCategory: reportCategory || 'full', dateRange },
      req.ip, req.headers['user-agent'] as string);

    res.status(201).json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error creando reporte', error: error.message });
  }
};

export const getReports = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find({ createdBy: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments({ createdBy: userId }),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo reportes', error: error.message });
  }
};

export const getReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;

    const report = (await Report.findById(reportId).lean()) as IReport | null;
    if (!report) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    const isCreator = report.createdBy.toString() === userId;
    const isShared = report.sharedWith.some(
      (s: any) => s.user.toString() === userId
    );

    if (!isCreator && !isShared) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este reporte' });
    }

    logAction(userId, 'report.viewed', 'access', reportId, 'Report',
      { title: report.title },
      req.ip, req.headers['user-agent']);

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo reporte', error: error.message });
  }
};

export const deleteReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    if (report.createdBy.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Solo el creador puede eliminar el reporte' });
    }

    await Report.findByIdAndDelete(reportId);

    logAction(userId, 'report.deleted', 'delete', reportId, 'Report',
      { title: report.title },
      req.ip, req.headers['user-agent']);

    res.json({ success: true, message: 'Reporte eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error eliminando reporte', error: error.message });
  }
};

export const signReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    const isCreator = report.createdBy.toString() === userId;
    const isShared = report.sharedWith.some(
      (s: any) => s.user.toString() === userId
    );

    if (!isCreator && !isShared) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este reporte' });
    }

    const timestamp = new Date();
    const payload = JSON.stringify(report.data) + userId + timestamp.toISOString();
    const hash = crypto.createHash('sha256').update(payload).digest('hex');

    const signer = await User.findById(userId).select('username email').lean();
    const signedBy = (signer as any)?.username || (signer as any)?.email || userId;

    report.signature = { hash, timestamp, signedBy } as any;
    await report.save();

    res.json({ success: true, data: report.signature });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error firmando reporte', error: error.message });
  }
};

export const shareReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;
    const { userId: targetUserId, permission } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'userId es requerido' });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    const isCreator = report.createdBy.toString() === userId;
    const existingShare = report.sharedWith.find(
      (s: any) => s.user.toString() === userId
    );
    const hasEdit = isCreator || existingShare?.permission === 'edit';

    if (!hasEdit) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para compartir este reporte' });
    }

    const alreadyShared = report.sharedWith.find(
      (s: any) => s.user.toString() === targetUserId
    );
    if (alreadyShared) {
      alreadyShared.permission = permission || 'view';
    } else {
      report.sharedWith.push({
        user: new mongoose.Types.ObjectId(targetUserId),
        permission: permission || 'view',
      });
    }

    await report.save();

    logAction(userId, 'report.shared', 'access', reportId, 'Report',
      { sharedWith: targetUserId, permission: permission || 'view', title: report.title },
      req.ip, req.headers['user-agent']);

    res.json({ success: true, data: report.sharedWith });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error compartiendo reporte', error: error.message });
  }
};

export const exportReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { reportId } = req.params;
    const format = (req.query.format as string) || 'json';

    const report = (await Report.findById(reportId).lean()) as IReport | null;
    if (!report) {
      return res.status(404).json({ success: false, message: 'Reporte no encontrado' });
    }

    const isCreator = report.createdBy.toString() === userId;
    const isShared = report.sharedWith.some(
      (s: any) => s.user.toString() === userId
    );

    if (!isCreator && !isShared) {
      return res.status(403).json({ success: false, message: 'No tienes acceso a este reporte' });
    }

    logAction(userId, 'report.exported', 'access', reportId, 'Report',
      { format, title: report.title },
      req.ip, req.headers['user-agent']);

    if (format === 'csv') {
      const esc = (v: any) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows: string[] = [];

      // Encabezado del reporte
      rows.push('REPORTE: ' + esc(report.title));
      rows.push('Tipo,' + esc(report.type));
      rows.push('Categoria,' + esc(report.reportCategory));
      rows.push('Periodo,' + esc(`${report.dateRange.start} al ${report.dateRange.end}`));
      rows.push('');

      // Resumen ejecutivo
      rows.push('=== RESUMEN EJECUTIVO ===');
      rows.push('Metrica,Valor');
      if (report.data.messages) {
        rows.push('Total Mensajes,' + esc(report.data.messages.total || 0));
        rows.push('Usuarios Unicos,' + esc(report.data.messages.uniqueSenders || 0));
        rows.push('Canales Totales,' + esc(report.data.messages.totalChannels || 0));
        rows.push('Canales Activos,' + esc(report.data.messages.activeChannels || 0));
        rows.push('Mensajes por Usuario,' + esc(report.data.messages.messagesPerUser || 0));
      }
      if (report.data.tasks) {
        rows.push('Total Tareas,' + esc(report.data.tasks.total || 0));
        rows.push('Tareas Completadas,' + esc(report.data.tasks.completed || 0));
        rows.push('Tasa de Completado,' + esc(`${report.data.tasks.completionRate || 0}%`));
        rows.push('Tareas Vencidas,' + esc(report.data.tasks.overdue || 0));
        rows.push('Horas Estimadas,' + esc(report.data.tasks.hoursEstimated || 0));
        rows.push('Horas Registradas,' + esc(report.data.tasks.hoursTracked || 0));
      }
      if (report.data.surveys) {
        rows.push('Total Encuestas,' + esc(report.data.surveys.total || 0));
        rows.push('Total Respuestas,' + esc(report.data.surveys.totalResponses || 0));
      }
      if (report.data.ai) {
        rows.push('Consultas IA,' + esc(report.data.ai.totalQueries || 0));
        rows.push('Costo Total IA (USD),' + esc(report.data.ai.totalCost || 0));
        rows.push('Tokens Totales,' + esc(report.data.ai.totalTokens || 0));
        rows.push('Tiempo Prom. Respuesta (ms),' + esc(report.data.ai.avgResponseTime || 0));
        rows.push('Tasa de Exito,' + esc(`${report.data.ai.successRate || 0}%`));
      }
      if (report.data.audit) {
        rows.push('Eventos de Auditoria,' + esc(report.data.audit.totalEvents || 0));
        rows.push('Logins Fallidos,' + esc(report.data.audit.failedLogins || 0));
        rows.push('Cambios de Permisos,' + esc(report.data.audit.permissionChanges || 0));
      }
      if (report.data.kpis) {
        rows.push('Usuarios Activos,' + esc(report.data.kpis.activeUsers || 0));
        rows.push('Puntuacion de Seguridad,' + esc(report.data.kpis.securityScore || 'healthy'));
      }
      rows.push('');

      // Actividad diaria
      if (report.data.messages?.messagesPerDay?.length) {
        rows.push('=== ACTIVIDAD DIARIA ===');
        rows.push('Fecha,Mensajes');
        for (const d of report.data.messages.messagesPerDay) {
          rows.push(`${d.date},${d.count}`);
        }
        rows.push('');
      }

      // Canales mas activos
      if (report.data.messages?.topChannels?.length) {
        rows.push('=== CANALES MAS ACTIVOS ===');
        rows.push('Canal,Plataforma,Mensajes');
        for (const ch of report.data.messages.topChannels) {
          rows.push(`${esc(ch.name)},${esc(ch.platform || '')},${ch.count}`);
        }
        rows.push('');
      }

      // Usuarios mas activos
      if (report.data.messages?.topUsers?.length) {
        rows.push('=== USUARIOS MAS ACTIVOS ===');
        rows.push('Usuario,Mensajes');
        for (const u of report.data.messages.topUsers) {
          rows.push(`${esc(u.username)},${u.messageCount}`);
        }
        rows.push('');
      }

      // Actividad por hora
      if (report.data.messages?.hourlyActivity?.length) {
        rows.push('=== ACTIVIDAD POR HORA ===');
        rows.push('Hora,Mensajes');
        for (const h of report.data.messages.hourlyActivity) {
          rows.push(`${h.hour}:00,${h.count}`);
        }
        rows.push('');
      }

      // Desglose de tareas
      if (report.data.tasks) {
        rows.push('=== DESGLOSE DE TAREAS ===');
        rows.push('Estado,Cantidad');
        rows.push(`Pendientes,${report.data.tasks.byStatus?.pending || 0}`);
        rows.push(`En Progreso,${report.data.tasks.byStatus?.in_progress || 0}`);
        rows.push(`Completadas,${report.data.tasks.byStatus?.completed || 0}`);
        rows.push(`Canceladas,${report.data.tasks.byStatus?.cancelled || 0}`);
        rows.push('');

        if (report.data.tasks.byPriority) {
          rows.push('=== TAREAS POR PRIORIDAD ===');
          rows.push('Prioridad,Cantidad');
          rows.push(`Baja,${report.data.tasks.byPriority.low || 0}`);
          rows.push(`Media,${report.data.tasks.byPriority.medium || 0}`);
          rows.push(`Alta,${report.data.tasks.byPriority.high || 0}`);
          rows.push(`Urgente,${report.data.tasks.byPriority.urgent || 0}`);
          rows.push('');
        }

        if (report.data.tasks.byUser?.length) {
          rows.push('=== TAREAS POR USUARIO ===');
          rows.push('Usuario,Total,Completadas');
          for (const u of report.data.tasks.byUser) {
            rows.push(`${esc(u.username)},${u.count},${u.completed}`);
          }
          rows.push('');
        }
      }

      // Modelos IA
      if (report.data.ai?.byModel?.length) {
        rows.push('=== CONSULTAS POR MODELO IA ===');
        rows.push('Modelo,Consultas,Tokens,Costo (USD)');
        for (const m of report.data.ai.byModel) {
          rows.push(`${esc(m.modelName)},${m.count},${m.totalTokens},${m.totalCost}`);
        }
        rows.push('');
      }

      // Auditoria por categoria
      if (report.data.audit?.byCategory?.length) {
        rows.push('=== EVENTOS DE AUDITORIA POR CATEGORIA ===');
        rows.push('Categoria,Cantidad');
        for (const c of report.data.audit.byCategory) {
          rows.push(`${esc(c.category)},${c.count}`);
        }
        rows.push('');
      }

      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.csv"`
      );
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.title.replace(/[^a-zA-Z0-9]/g, '_')}.json"`
    );
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error exportando reporte', error: error.message });
  }
};

export const scheduleReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { title, description, type, dateRange, filters, schedule } = req.body;

    if (!title || !type || !schedule?.frequency) {
      return res
        .status(400)
        .json({ success: false, message: 'title, type y schedule.frequency son requeridos' });
    }

    const nextGeneration = calculateNextGeneration(schedule);

    const scheduled = await ScheduledReport.create({
      title,
      description: description || '',
      type,
      createdBy: userId,
      dateRange: dateRange || { start: new Date(), end: new Date() },
      filters: filters || { platforms: [], channels: [], users: [] },
      schedule: {
        frequency: schedule.frequency,
        time: schedule.time || '09:00',
        dayOfWeek: schedule.dayOfWeek ?? null,
        dayOfMonth: schedule.dayOfMonth ?? null,
      },
      nextGeneration,
      isActive: true,
    });

    res.status(201).json({ success: true, data: scheduled });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error programando reporte', error: error.message });
  }
};

export const getScheduledReports = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const reports = await ScheduledReport.find({ createdBy: userId })
      .sort({ nextGeneration: 1 })
      .lean();

    res.json({ success: true, data: reports });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo reportes programados', error: error.message });
  }
};

export const deleteScheduledReport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const scheduled = await ScheduledReport.findById(id);
    if (!scheduled) {
      return res.status(404).json({ success: false, message: 'Reporte programado no encontrado' });
    }

    if (scheduled.createdBy.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Solo el creador puede eliminar este reporte programado' });
    }

    await ScheduledReport.findByIdAndDelete(id);
    res.json({ success: true, message: 'Reporte programado eliminado' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error eliminando reporte programado', error: error.message });
  }
};
