import mongoose, { Schema, Document } from 'mongoose';
import { Response } from 'express';
import crypto from 'crypto';
import Message from '../models/Message';
import Channel from '../models/Channel';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';

// ==================== MODELS (Report / ScheduledReport) ====================

export interface IReport extends Document {
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  createdBy: mongoose.Types.ObjectId;
  dateRange: { start: Date; end: Date };
  filters: {
    platforms: string[];
    channels: mongoose.Types.ObjectId[];
    users: mongoose.Types.ObjectId[];
  };
  data: {
    summary: {
      totalMessages: number;
      totalUniqueSenders: number;
      totalChannels: number;
      activeChannels: number;
      avgResponseTime: number;
      uptimeEstimate: number;
    };
    messagesPerDay: { date: string; count: number }[];
    topChannels: { name: string; platform: string; count: number }[];
    topUsers: { username: string; messageCount: number }[];
    platformDistribution: { platform: string; count: number }[];
    hourlyActivity: { hour: number; count: number }[];
    kpis: {
      messagesPerUser: number;
      responseTime: number;
      channelActivityRate: number;
      userRetention: number;
    };
    comparison: {
      totalMessages: number;
      totalUniqueSenders: number;
      avgResponseTime: number;
    };
  };
  status: 'pending' | 'completed' | 'failed';
  signature?: {
    hash: string;
    timestamp: Date;
  };
  sharedWith: {
    user: mongoose.Types.ObjectId;
    permission: 'view' | 'edit';
  }[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IScheduledReport extends Document {
  title: string;
  description: string;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  createdBy: mongoose.Types.ObjectId;
  dateRange: { start: Date; end: Date };
  filters: {
    platforms: string[];
    channels: mongoose.Types.ObjectId[];
    users: mongoose.Types.ObjectId[];
  };
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
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
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    dateRange: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    filters: {
      platforms: { type: [String], default: [] },
      channels: { type: [Schema.Types.ObjectId], ref: 'Channel', default: [] },
      users: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    },
    data: {
      summary: {
        totalMessages: { type: Number, default: 0 },
        totalUniqueSenders: { type: Number, default: 0 },
        totalChannels: { type: Number, default: 0 },
        activeChannels: { type: Number, default: 0 },
        avgResponseTime: { type: Number, default: 0 },
        uptimeEstimate: { type: Number, default: 100 },
      },
      messagesPerDay: [
        { date: String, count: Number },
      ],
      topChannels: [
        { name: String, platform: String, count: Number },
      ],
      topUsers: [
        { username: String, messageCount: Number },
      ],
      platformDistribution: [
        { platform: String, count: Number },
      ],
      hourlyActivity: [
        { hour: Number, count: Number },
      ],
      kpis: {
        messagesPerUser: { type: Number, default: 0 },
        responseTime: { type: Number, default: 0 },
        channelActivityRate: { type: Number, default: 0 },
        userRetention: { type: Number, default: 0 },
      },
      comparison: {
        totalMessages: { type: Number, default: 0 },
        totalUniqueSenders: { type: Number, default: 0 },
        avgResponseTime: { type: Number, default: 0 },
      },
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
    },
    signature: {
      hash: { type: String, default: null },
      timestamp: { type: Date, default: null },
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
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
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
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        required: true,
      },
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
  filters: { platforms: string[]; channels: string[]; users: string[] }
) {
  const userChannelIds = await getUserChannelIds(userId);
  const matchStage: any = {
    channel: { $in: userChannelIds },
    createdAt: { $gte: dateRange.start, $lte: dateRange.end },
  };

  if (filters.channels?.length) {
    matchStage.channel = {
      $in: userChannelIds.filter((id) =>
        filters.channels.includes(id.toString())
      ),
    };
  }

  if (filters.users?.length) {
    matchStage.sender = { $in: filters.users };
  }

  let channelIdsForPlatform = userChannelIds;
  if (filters.platforms?.length) {
    const platformChannels = await Channel.find({
      _id: { $in: userChannelIds },
      platform: { $in: filters.platforms },
    })
      .select('_id')
      .lean();
    channelIdsForPlatform = platformChannels.map((c: any) => c._id);
    matchStage.channel = { $in: channelIdsForPlatform };
  }

  // --- summary ---
  const [totalMessages, uniqueSendersAgg, totalChannelsCount, activeChannelsAgg] =
    await Promise.all([
      Message.countDocuments(matchStage),
      Message.aggregate([
        { $match: matchStage },
        { $group: { _id: '$sender' } },
        { $count: 'total' },
      ]),
      Channel.countDocuments({ _id: { $in: userChannelIds } }),
      Message.aggregate([
        { $match: matchStage },
        { $group: { _id: '$channel' } },
        { $count: 'total' },
      ]),
    ]);

  const totalUniqueSenders = uniqueSendersAgg[0]?.total || 0;
  const activeChannels = activeChannelsAgg[0]?.total || 0;

  // avg response time (ms between consecutive messages in same channel)
  const avgResponseAgg = await Message.aggregate([
    { $match: matchStage },
    { $sort: { channel: 1, createdAt: 1 } },
    {
      $group: {
        _id: '$channel',
        messages: { $push: '$createdAt' },
      },
    },
    {
      $project: {
        diffs: {
          $filter: {
            input: {
              $map: {
                input: { $range: [1, { $size: '$messages' }] },
                as: 'i',
                in: {
                  $subtract: [
                    { $arrayElemAt: ['$messages', '$$i'] },
                    { $arrayElemAt: ['$messages', { $subtract: ['$$i', 1] }] },
                  ],
                },
              },
            },
            cond: { $lt: ['$$this', 86400000] },
          },
        },
      },
    },
    { $unwind: '$diffs' },
    { $group: { _id: null, avgMs: { $avg: '$diffs' } } },
  ]);
  const avgResponseTime = Math.round(avgResponseAgg[0]?.avgMs || 0);

  const uptimeEstimate =
    totalChannelsCount > 0
      ? Math.round((activeChannels / totalChannelsCount) * 100)
      : 100;

  // --- messagesPerDay ---
  const messagesPerDay = await Message.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
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
          },
        },
        count: 1,
        _id: 0,
      },
    },
    { $sort: { date: 1 } },
  ]);

  // --- topChannels ---
  const topChannels = await Message.aggregate([
    { $match: matchStage },
    { $group: { _id: '$channel', count: { $sum: 1 } } },
    {
      $lookup: {
        from: 'channels',
        localField: '_id',
        foreignField: '_id',
        as: 'ch',
      },
    },
    { $unwind: '$ch' },
    {
      $project: {
        name: '$ch.name',
        platform: '$ch.platform',
        count: 1,
        _id: 0,
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  // --- topUsers ---
  const topUsers = await Message.aggregate([
    { $match: matchStage },
    { $group: { _id: '$sender', messageCount: { $sum: 1 } } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'u',
      },
    },
    { $unwind: '$u' },
    {
      $project: { username: '$u.username', messageCount: 1, _id: 0 },
    },
    { $sort: { messageCount: -1 } },
    { $limit: 10 },
  ]);

  // --- platformDistribution ---
  const platformDistribution = await Message.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: 'channels',
        localField: 'channel',
        foreignField: '_id',
        as: 'ch',
      },
    },
    { $unwind: '$ch' },
    { $group: { _id: '$ch.platform', count: { $sum: 1 } } },
    { $project: { platform: '$_id', count: 1, _id: 0 } },
    { $sort: { count: -1 } },
  ]);

  // --- hourlyActivity ---
  const hourlyActivity = await Message.aggregate([
    { $match: matchStage },
    { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
    { $project: { hour: '$_id', count: 1, _id: 0 } },
    { $sort: { hour: 1 } },
  ]);

  // --- kpis ---
  const messagesPerUser =
    totalUniqueSenders > 0
      ? Math.round((totalMessages / totalUniqueSenders) * 100) / 100
      : 0;
  const channelActivityRate =
    totalChannelsCount > 0
      ? Math.round((activeChannels / totalChannelsCount) * 10000) / 100
      : 0;

  const sevenDaysAgo = new Date(
    dateRange.end.getTime() - 7 * 24 * 60 * 60 * 1000
  );
  const recentActiveSenders = await Message.distinct('sender', {
    channel: { $in: userChannelIds },
    createdAt: { $gte: sevenDaysAgo, $lte: dateRange.end },
  });
  const allChannelMembers = await Channel.distinct('members', {
    _id: { $in: userChannelIds },
  });
  const userRetention =
    allChannelMembers.length > 0
      ? Math.round(
          (recentActiveSenders.length / allChannelMembers.length) * 10000
        ) / 100
      : 0;

  // --- comparison (previous period of same length) ---
  const periodMs = dateRange.end.getTime() - dateRange.start.getTime();
  const prevStart = new Date(dateRange.start.getTime() - periodMs);
  const prevEnd = new Date(dateRange.start.getTime() - 1);
  const prevMatch: any = {
    channel: { $in: userChannelIds },
    createdAt: { $gte: prevStart, $lte: prevEnd },
  };
  if (filters.channels?.length) {
    prevMatch.channel = {
      $in: userChannelIds.filter((id) =>
        filters.channels.includes(id.toString())
      ),
    };
  }
  if (filters.users?.length) {
    prevMatch.sender = { $in: filters.users };
  }
  if (filters.platforms?.length) {
    prevMatch.channel = { $in: channelIdsForPlatform };
  }

  const [prevTotalMessages, prevUniqueSendersAgg, prevAvgResponseAgg] =
    await Promise.all([
      Message.countDocuments(prevMatch),
      Message.aggregate([
        { $match: prevMatch },
        { $group: { _id: '$sender' } },
        { $count: 'total' },
      ]),
      Message.aggregate([
        { $match: prevMatch },
        { $sort: { channel: 1, createdAt: 1 } },
        {
          $group: {
            _id: '$channel',
            messages: { $push: '$createdAt' },
          },
        },
        {
          $project: {
            diffs: {
              $filter: {
                input: {
                  $map: {
                    input: { $range: [1, { $size: '$messages' }] },
                    as: 'i',
                    in: {
                      $subtract: [
                        { $arrayElemAt: ['$messages', '$$i'] },
                        {
                          $arrayElemAt: [
                            '$messages',
                            { $subtract: ['$$i', 1] },
                          ],
                        },
                      ],
                    },
                  },
                },
                cond: { $lt: ['$$this', 86400000] },
              },
            },
          },
        },
        { $unwind: '$diffs' },
        { $group: { _id: null, avgMs: { $avg: '$diffs' } } },
      ]),
    ]);

  const prevTotalUniqueSenders = prevUniqueSendersAgg[0]?.total || 0;
  const prevAvgResponseTime = Math.round(prevAvgResponseAgg[0]?.avgMs || 0);

  return {
    summary: {
      totalMessages,
      totalUniqueSenders,
      totalChannels: totalChannelsCount,
      activeChannels,
      avgResponseTime,
      uptimeEstimate,
    },
    messagesPerDay: messagesPerDay.map((d: any) => ({
      date: d.date.toISOString().split('T')[0],
      count: d.count,
    })),
    topChannels,
    topUsers,
    platformDistribution,
    hourlyActivity,
    kpis: {
      messagesPerUser,
      responseTime: avgResponseTime,
      channelActivityRate,
      userRetention,
    },
    comparison: {
      totalMessages: computePercentChange(totalMessages, prevTotalMessages),
      totalUniqueSenders: computePercentChange(
        totalUniqueSenders,
        prevTotalUniqueSenders
      ),
      avgResponseTime: computePercentChange(avgResponseTime, prevAvgResponseTime),
    },
  };
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
    const { title, description, type, dateRange, filters } = req.body;

    if (!title || !type || !dateRange?.start || !dateRange?.end) {
      return res
        .status(400)
        .json({ success: false, message: 'title, type, dateRange.start y dateRange.end son requeridos' });
    }

    const parsedDateRange = { start: new Date(dateRange.start), end: new Date(dateRange.end) };
    const reportData = await generateReportData(userId, parsedDateRange, filters || {});

    const report = await Report.create({
      title,
      description: description || '',
      type,
      createdBy: userId,
      dateRange: parsedDateRange,
      filters: filters || { platforms: [], channels: [], users: [] },
      data: reportData,
      status: 'completed',
    });

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

    report.signature = { hash, timestamp };
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

    if (format === 'csv') {
      const rows: string[] = [];
      rows.push('Metric,Value');
      rows.push(`Title,${report.title}`);
      rows.push(`Type,${report.type}`);
      rows.push(`Date Range,${report.dateRange.start} - ${report.dateRange.end}`);
      rows.push(`Total Messages,${report.data.summary.totalMessages}`);
      rows.push(`Total Unique Senders,${report.data.summary.totalUniqueSenders}`);
      rows.push(`Total Channels,${report.data.summary.totalChannels}`);
      rows.push(`Active Channels,${report.data.summary.activeChannels}`);
      rows.push(`Avg Response Time (ms),${report.data.summary.avgResponseTime}`);
      rows.push('');
      rows.push('Messages Per Day');
      rows.push('Date,Count');
      for (const d of report.data.messagesPerDay) {
        rows.push(`${d.date},${d.count}`);
      }
      rows.push('');
      rows.push('Top Channels');
      rows.push('Name,Platform,Count');
      for (const ch of report.data.topChannels) {
        rows.push(`${ch.name},${ch.platform},${ch.count}`);
      }
      rows.push('');
      rows.push('Top Users');
      rows.push('Username,Message Count');
      for (const u of report.data.topUsers) {
        rows.push(`${u.username},${u.messageCount}`);
      }
      rows.push('');
      rows.push('Platform Distribution');
      rows.push('Platform,Count');
      for (const p of report.data.platformDistribution) {
        rows.push(`${p.platform},${p.count}`);
      }
      rows.push('');
      rows.push('Hourly Activity');
      rows.push('Hour,Count');
      for (const h of report.data.hourlyActivity) {
        rows.push(`${h.hour},${h.count}`);
      }

      const csv = rows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
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
