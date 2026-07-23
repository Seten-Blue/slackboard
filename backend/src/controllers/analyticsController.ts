import mongoose from 'mongoose';
import { Response } from 'express';
import os from 'os';
import Analytics from '../models/Analytics';
import Message from '../models/Message';
import Channel from '../models/Channel';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { getFriendIds } from './friendshipController';

// Helper: get channel IDs where user is member
async function getUserChannelIds(userId: string): Promise<string[]> {
  const channels = await Channel.find({ members: userId }).select('_id').lean();
  return channels.map((c: any) => c._id);
}

// ==================== ACTIVITY ====================

// GET /api/analytics/activity
export const getActivity = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const channelIds = await getUserChannelIds(userId);
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Users who recently sent messages in the user's channels (last 24h) - only friends
    const friendIds = await getFriendIds(userId);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentSenderIds = await Message.distinct('sender', {
      channel: { $in: channelIds },
      createdAt: { $gte: oneDayAgo },
      sender: { $in: friendIds },
    });
    const connectedUsers = await User.find({
      _id: { $in: recentSenderIds },
    }).select('username avatar status').limit(15).lean();

    // Messages sent in last 5 min (user's channels)
    const recentMessages = await Message.countDocuments({
      channel: { $in: channelIds },
      createdAt: { $gte: fiveMinAgo },
    });

    // Channels with recent activity (last hour)
    const recentChannelsAgg = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, createdAt: { $gte: oneHourAgo } } },
      { $group: { _id: '$channel', lastMessage: { $max: '$createdAt' }, count: { $sum: 1 } } },
      { $lookup: { from: 'channels', localField: '_id', foreignField: '_id', as: 'ch' } },
      { $unwind: '$ch' },
      { $project: { name: '$ch.name', platform: '$ch.platform', lastMessage: 1, count: 1, _id: 0 } },
      { $sort: { lastMessage: -1 } },
      { $limit: 10 },
    ]);

    // Active conversations (threads with recent replies)
    const activeConversations = await Message.aggregate([
      { $match: { threadParent: { $ne: null }, channel: { $in: channelIds }, createdAt: { $gte: oneHourAgo } } },
      { $group: { _id: '$threadParent', replyCount: { $sum: 1 }, lastReply: { $max: '$createdAt' } } },
      { $lookup: { from: 'messages', localField: '_id', foreignField: '_id', as: 'parent' } },
      { $unwind: '$parent' },
      { $lookup: { from: 'users', localField: 'parent.sender', foreignField: '_id', as: 'senderInfo' } },
      { $unwind: { path: '$senderInfo', preserveNullAndEmptyArrays: true } },
      { $project: {
        parentContent: { $substrCP: ['$parent.content', 0, 60] },
        senderName: '$senderInfo.username',
        replyCount: 1,
        lastReply: 1,
        _id: 0,
      }},
      { $sort: { lastReply: -1 } },
      { $limit: 10 },
    ]);

    // Bot/integration activity
    const botMessages = await Message.countDocuments({
      channel: { $in: channelIds },
      sentViaBot: true,
      createdAt: { $gte: fiveMinAgo },
    });

    // Recent events (last 20 messages in user's channels)
    const recentEvents = await Message.find({ channel: { $in: channelIds } })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('sender', 'username avatar')
      .select('content type createdAt sender channel')
      .lean();

    // Recent files shared
    const recentFiles = await Message.find({
      channel: { $in: channelIds },
      type: { $in: ['file', 'image'] },
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('sender', 'username')
      .select('content type attachments createdAt sender')
      .lean();

    // Average response time (time between consecutive messages in same channel)
    const avgResponseTimeAgg = await Message.aggregate([
      { $match: { channel: { $in: channelIds } } },
      { $sort: { channel: 1, createdAt: 1 } },
      { $group: {
        _id: '$channel',
        messages: { $push: '$createdAt' },
      }},
      { $project: {
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
      }},
      { $unwind: '$diffs' },
      { $group: { _id: null, avgMs: { $avg: '$diffs' } } },
    ]);
    const avgResponseMs = avgResponseTimeAgg[0]?.avgMs || 0;

    res.json({
      success: true,
      data: {
        connectedUsers,
        connectedCount: connectedUsers.length,
        recentMessages,
        recentChannels: recentChannelsAgg,
        activeConversations,
        botActivity: botMessages,
        recentEvents,
        recentFiles,
        avgResponseTime: Math.round(avgResponseMs),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo actividad', error: error.message });
  }
};

// ==================== TRAFFIC ====================

// GET /api/analytics/traffic
export const getTraffic = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const channelIds = await getUserChannelIds(userId);
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Messages per minute (last hour, grouped by minute)
    const msgsPerMinute = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, createdAt: { $gte: oneHourAgo } } },
      { $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' },
          minute: { $minute: '$createdAt' },
        },
        count: { $sum: 1 },
      }},
      { $project: { _id: 0, time: '$_id', count: 1 } },
      { $sort: { 'time.hour': 1, 'time.minute': 1 } },
    ]);

    // Data volume (approximate content length in bytes, last 24h)
    const volumeAgg = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, createdAt: { $gte: oneDayAgo } } },
      { $project: { contentLen: { $strLenCP: '$content' } } },
      { $group: { _id: null, totalBytes: { $sum: '$contentLen' }, count: { $sum: 1 } } },
    ]);
    const totalBytes = volumeAgg[0]?.totalBytes || 0;
    const totalMessages24h = volumeAgg[0]?.count || 0;

    // Traffic by platform (messages per platform in user's channels)
    const platformTraffic = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, createdAt: { $gte: oneDayAgo } } },
      { $lookup: { from: 'channels', localField: 'channel', foreignField: '_id', as: 'ch' } },
      { $unwind: '$ch' },
      { $group: { _id: '$ch.platform', count: { $sum: 1 } } },
      { $project: { platform: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);

    // File upload traffic (messages with files)
    const fileTraffic = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, type: { $in: ['file', 'image'] }, createdAt: { $gte: oneDayAgo } } },
      { $project: { attachCount: { $size: { $ifNull: ['$attachments', []] } } } },
      { $group: { _id: null, totalFiles: { $sum: '$attachCount' }, totalMessages: { $sum: 1 } } },
    ]);

    // Server resources
    const memUsage = process.memoryUsage();
    const serverResources = {
      cpuUsage: Math.round(os.loadavg()[0] / os.cpus().length * 100),
      ramUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      ramTotal: Math.round(os.totalmem() / 1024 / 1024),
      ramPercent: Math.round(memUsage.heapUsed / os.totalmem() * 100),
      uptime: Math.round(process.uptime()),
      cpuCount: os.cpus().length,
    };

    // Integration status
    const integrationStatus = {
      slack: !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_BOT_TOKEN.startsWith('xoxb-')),
      discord: !!(process.env.DISCORD_BOT_TOKEN),
      ai: !!(process.env.GEMINI_API_KEY),
      whatsapp: !!(process.env.WHATSAPP_PHONE_NUMBER_ID),
    };

    res.json({
      success: true,
      data: {
        msgsPerMinute,
        dataVolume: {
          totalBytes,
          totalFormatted: formatBytes(totalBytes),
          totalMessages: totalMessages24h,
        },
        platformTraffic,
        fileTraffic: fileTraffic[0] || { totalFiles: 0, totalMessages: 0 },
        serverResources,
        integrationStatus,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo trafico', error: error.message });
  }
};

// ==================== STATISTICS ====================

// GET /api/analytics/stats
export const getStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const channelIds = await getUserChannelIds(userId);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // User growth (last 30 days, from users in same channels)
    const memberIds = await Channel.distinct('members', { _id: { $in: channelIds } });
    const userGrowth = await User.aggregate([
      { $match: { _id: { $in: memberIds }, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $project: {
        date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
        count: 1, _id: 0,
      }},
      { $sort: { date: 1 } },
    ]);

    // Message evolution (30 days)
    const messageEvolution = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $project: {
        date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
        count: 1, _id: 0,
      }},
      { $sort: { date: 1 } },
    ]);

    // Channel growth
    const channelGrowth = await Channel.aggregate([
      { $match: { _id: { $in: channelIds }, createdAt: { $gte: ninetyDaysAgo } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $project: {
        date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
        count: 1, _id: 0,
      }},
      { $sort: { date: 1 } },
    ]);

    // Activity heatmap (last 30 days: hour x dayOfWeek)
    const heatmap = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, createdAt: { $gte: thirtyDaysAgo } } },
      { $project: {
        hour: { $hour: '$createdAt' },
        dayOfWeek: { $dayOfWeek: '$createdAt' },
      }},
      { $group: { _id: { hour: '$hour', day: '$dayOfWeek' }, count: { $sum: 1 } } },
      { $project: { hour: '$_id.hour', day: '$_id.day', count: 1, _id: 0 } },
    ]);

    // Top users (friends only, in user's channels, excluding self and bots)
    const friendIds = await getFriendIds(userId);
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const topUsers = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, sender: { $in: friendIds }, sentViaBot: { $ne: true } } },
      { $group: { _id: '$sender', messageCount: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: '$u' },
      { $project: { username: '$u.username', avatar: '$u.avatar', messageCount: 1, _id: 0 } },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
    ]);

    // Top channels
    const topChannels = await Message.aggregate([
      { $match: { channel: { $in: channelIds } } },
      { $group: { _id: '$channel', count: { $sum: 1 } } },
      { $lookup: { from: 'channels', localField: '_id', foreignField: '_id', as: 'ch' } },
      { $unwind: '$ch' },
      { $project: { name: '$ch.name', platform: '$ch.platform', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Reaction distribution
    const reactionDist = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, 'reactions.0': { $exists: true } } },
      { $unwind: '$reactions' },
      { $group: { _id: '$reactions.emoji', count: { $sum: { $size: '$reactions.users' } } } },
      { $project: { emoji: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]);

    // File type distribution
    const fileTypeDist = await Message.aggregate([
      { $match: { channel: { $in: channelIds }, type: { $in: ['file', 'image'] }, attachments: { $exists: true, $ne: [] } } },
      { $unwind: '$attachments' },
      { $project: { ext: { $toLower: { $arrayElemAt: [{ $split: ['$attachments', '.'] }, -1] } } } },
      { $group: { _id: '$ext', count: { $sum: 1 } } },
      { $project: { type: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // User retention (how many of user's channels have had activity in last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const activeChannelsLast7 = await Message.distinct('channel', {
      channel: { $in: channelIds },
      createdAt: { $gte: sevenDaysAgo },
    });
    const retentionRate = channelIds.length > 0
      ? Math.round((activeChannelsLast7.length / channelIds.length) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        userGrowth,
        messageEvolution,
        channelGrowth,
        heatmap,
        topUsers,
        topChannels,
        reactionDistribution: reactionDist,
        fileTypeDistribution: fileTypeDist,
        retention: {
          activeChannels: activeChannelsLast7.length,
          totalChannels: channelIds.length,
          rate: retentionRate,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo estadisticas', error: error.message });
  }
};

// ==================== LEGACY (kept for backward compat) ====================

export const getGeneralStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalChannels = await Channel.countDocuments();
    const totalMessages = await Message.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'online' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await Message.countDocuments({ createdAt: { $gte: today } });

    const messagesPerChannel = await Message.aggregate([
      { $group: { _id: '$channel', count: { $sum: 1 } } },
      { $lookup: { from: 'channels', localField: '_id', foreignField: '_id', as: 'channelInfo' } },
      { $unwind: '$channelInfo' },
      { $project: { channelId: '$_id', channelName: '$channelInfo.name', count: 1 } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const topUsers = await Message.aggregate([
      { $group: { _id: '$sender', messageCount: { $sum: 1 } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
      { $unwind: '$userInfo' },
      { $project: { userId: '$_id', username: '$userInfo.username', avatar: '$userInfo.avatar', messageCount: 1 } },
      { $sort: { messageCount: -1 } },
      { $limit: 5 },
    ]);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const peakHours = await Message.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $hour: '$createdAt' }, messageCount: { $sum: 1 } } },
      { $project: { hour: '$_id', messageCount: 1, _id: 0 } },
      { $sort: { hour: 1 } },
    ]);

    res.json({
      success: true,
      data: { overview: { totalUsers, totalChannels, totalMessages, activeUsers, messagesToday }, messagesPerChannel, topUsers, peakHours },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener estadisticas', error: error.message });
  }
};

export const getStatsByDate = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const analytics = await Analytics.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 });
    res.json({ success: true, count: analytics.length, data: analytics });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener estadisticas por fecha', error: error.message });
  }
};

export const getMessageTrends = async (req: AuthRequest, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const trends = await Message.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 } } },
      { $project: { date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } }, count: 1, _id: 0 } },
      { $sort: { date: 1 } },
    ]);
    res.json({ success: true, data: trends });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al obtener tendencias', error: error.message });
  }
};

export const generateDailyReport = async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const activeUsers = await User.countDocuments({ updatedAt: { $gte: today, $lt: tomorrow } });
    const totalMessages = await Message.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } });
    const totalChannels = await Channel.countDocuments();
    const report = await Analytics.create({ date: today, activeUsers, totalMessages, totalChannels, messagesPerChannel: [], topUsers: [], peakHours: [] });
    res.json({ success: true, message: 'Reporte generado exitosamente', data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
