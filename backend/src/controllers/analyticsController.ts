import { Request, Response } from 'express';
import Analytics from '../models/Analytics';
import Message from '../models/Message';
import Channel from '../models/Channel';
import User from '../models/User';

// Obtener estadísticas generales
export const getGeneralStats = async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalChannels = await Channel.countDocuments();
    const totalMessages = await Message.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'online' });

    // Mensajes de hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesToday = await Message.countDocuments({
      createdAt: { $gte: today },
    });

    // Mensajes por canal
    const messagesPerChannel = await Message.aggregate([
      {
        $group: {
          _id: '$channel',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'channels',
          localField: '_id',
          foreignField: '_id',
          as: 'channelInfo',
        },
      },
      {
        $unwind: '$channelInfo',
      },
      {
        $project: {
          channelId: '$_id',
          channelName: '$channelInfo.name',
          count: 1,
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Usuarios más activos
    const topUsers = await Message.aggregate([
      {
        $group: {
          _id: '$sender',
          messageCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $unwind: '$userInfo',
      },
      {
        $project: {
          userId: '$_id',
          username: '$userInfo.username',
          avatar: '$userInfo.avatar',
          messageCount: 1,
        },
      },
      { $sort: { messageCount: -1 } },
      { $limit: 5 },
    ]);

    // Horas pico (últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const peakHours = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          messageCount: { $sum: 1 },
        },
      },
      {
        $project: {
          hour: '$_id',
          messageCount: 1,
          _id: 0,
        },
      },
      { $sort: { hour: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalChannels,
          totalMessages,
          activeUsers,
          messagesToday,
        },
        messagesPerChannel,
        topUsers,
        peakHours,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message,
    });
  }
};

// Obtener estadísticas por fecha
export const getStatsByDate = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date();
    const end = endDate ? new Date(endDate as string) : new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const analytics = await Analytics.find({
      date: { $gte: start, $lte: end },
    }).sort({ date: 1 });

    res.json({
      success: true,
      count: analytics.length,
      data: analytics,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas por fecha',
      error: error.message,
    });
  }
};

// Obtener tendencias de mensajes (últimos 30 días)
export const getMessageTrends = async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trends = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
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

    res.json({
      success: true,
      data: trends,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener tendencias',
      error: error.message,
    });
  }
};

// Generar reporte diario (se puede ejecutar con cron job)
export const generateDailyReport = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeUsers = await User.countDocuments({
      updatedAt: { $gte: today, $lt: tomorrow },
    });

    const totalMessages = await Message.countDocuments({
      createdAt: { $gte: today, $lt: tomorrow },
    });

    const totalChannels = await Channel.countDocuments();

    const messagesPerChannel = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: '$channel',
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'channels',
          localField: '_id',
          foreignField: '_id',
          as: 'channelInfo',
        },
      },
      {
        $unwind: '$channelInfo',
      },
      {
        $project: {
          channelId: '$_id',
          channelName: '$channelInfo.name',
          count: 1,
        },
      },
    ]);

    const topUsers = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: '$sender',
          messageCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $unwind: '$userInfo',
      },
      {
        $project: {
          userId: '$_id',
          username: '$userInfo.username',
          messageCount: 1,
        },
      },
      { $sort: { messageCount: -1 } },
      { $limit: 5 },
    ]);

    const peakHours = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow },
        },
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          messageCount: { $sum: 1 },
        },
      },
      {
        $project: {
          hour: '$_id',
          messageCount: 1,
          _id: 0,
        },
      },
      { $sort: { hour: 1 } },
    ]);

    const report = await Analytics.create({
      date: today,
      activeUsers,
      totalMessages,
      totalChannels,
      messagesPerChannel,
      topUsers,
      peakHours,
    });

    res.json({
      success: true,
      message: 'Reporte generado exitosamente',
      data: report,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Error al generar reporte',
      error: error.message,
    });
  }
};