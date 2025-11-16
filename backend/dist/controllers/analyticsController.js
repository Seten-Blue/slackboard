"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDailyReport = exports.getMessageTrends = exports.getStatsByDate = exports.getGeneralStats = void 0;
const Analytics_1 = __importDefault(require("../models/Analytics"));
const Message_1 = __importDefault(require("../models/Message"));
const Channel_1 = __importDefault(require("../models/Channel"));
const User_1 = __importDefault(require("../models/User"));
// Obtener estadísticas generales
const getGeneralStats = async (req, res) => {
    try {
        const totalUsers = await User_1.default.countDocuments();
        const totalChannels = await Channel_1.default.countDocuments();
        const totalMessages = await Message_1.default.countDocuments();
        const activeUsers = await User_1.default.countDocuments({ status: 'online' });
        // Mensajes de hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const messagesToday = await Message_1.default.countDocuments({
            createdAt: { $gte: today },
        });
        // Mensajes por canal
        const messagesPerChannel = await Message_1.default.aggregate([
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
        const topUsers = await Message_1.default.aggregate([
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
        const peakHours = await Message_1.default.aggregate([
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas',
            error: error.message,
        });
    }
};
exports.getGeneralStats = getGeneralStats;
// Obtener estadísticas por fecha
const getStatsByDate = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        const analytics = await Analytics_1.default.find({
            date: { $gte: start, $lte: end },
        }).sort({ date: 1 });
        res.json({
            success: true,
            count: analytics.length,
            data: analytics,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas por fecha',
            error: error.message,
        });
    }
};
exports.getStatsByDate = getStatsByDate;
// Obtener tendencias de mensajes (últimos 30 días)
const getMessageTrends = async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const trends = await Message_1.default.aggregate([
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al obtener tendencias',
            error: error.message,
        });
    }
};
exports.getMessageTrends = getMessageTrends;
// Generar reporte diario (se puede ejecutar con cron job)
const generateDailyReport = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const activeUsers = await User_1.default.countDocuments({
            updatedAt: { $gte: today, $lt: tomorrow },
        });
        const totalMessages = await Message_1.default.countDocuments({
            createdAt: { $gte: today, $lt: tomorrow },
        });
        const totalChannels = await Channel_1.default.countDocuments();
        const messagesPerChannel = await Message_1.default.aggregate([
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
        const topUsers = await Message_1.default.aggregate([
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
        const peakHours = await Message_1.default.aggregate([
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
        const report = await Analytics_1.default.create({
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
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error al generar reporte',
            error: error.message,
        });
    }
};
exports.generateDailyReport = generateDailyReport;
