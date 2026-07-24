import { Response } from 'express';
import mongoose from 'mongoose';
import os from 'os';
import { execSync } from 'child_process';
import { AuthRequest } from '../middleware/auth';
import PerformanceMetric from '../models/PerformanceMetric';
import trelloService from '../services/trelloService';
import discordservice from '../services/discordservice';

// CPU usage from idle/total deltas
function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  return Math.round((1 - totalIdle / totalTick) * 100);
}

// Disk usage via df
function getDiskUsage(): { totalKB: number; usedKB: number; freeKB: number; usagePercent: number } | null {
  try {
    const output = execSync('df -k / | tail -1', { encoding: 'utf-8' }).trim();
    const parts = output.split(/\s+/);
    return {
      totalKB: parseInt(parts[1], 10),
      usedKB: parseInt(parts[2], 10),
      freeKB: parseInt(parts[3], 10),
      usagePercent: parseInt(parts[4], 10),
    };
  } catch {
    return null;
  }
}

// Bottleneck detection
function detectBottlenecks(cpuPercent: number, memPercent: number, diskPercent: number | null, dbLatencyMs: number) {
  const bottlenecks: { metric: string; value: number; severity: 'medium' | 'high'; detectedAt: Date }[] = [];
  const now = new Date();

  if (cpuPercent > 80) {
    bottlenecks.push({ metric: 'cpu', value: cpuPercent, severity: 'high', detectedAt: now });
  } else if (cpuPercent > 60) {
    bottlenecks.push({ metric: 'cpu', value: cpuPercent, severity: 'medium', detectedAt: now });
  }

  if (memPercent > 85) {
    bottlenecks.push({ metric: 'memory', value: memPercent, severity: 'high', detectedAt: now });
  } else if (memPercent > 70) {
    bottlenecks.push({ metric: 'memory', value: memPercent, severity: 'medium', detectedAt: now });
  }

  if (diskPercent !== null) {
    if (diskPercent > 90) {
      bottlenecks.push({ metric: 'disk', value: diskPercent, severity: 'high', detectedAt: now });
    } else if (diskPercent > 75) {
      bottlenecks.push({ metric: 'disk', value: diskPercent, severity: 'medium', detectedAt: now });
    }
  }

  if (dbLatencyMs > 500) {
    bottlenecks.push({ metric: 'database_latency', value: dbLatencyMs, severity: 'high', detectedAt: now });
  } else if (dbLatencyMs > 200) {
    bottlenecks.push({ metric: 'database_latency', value: dbLatencyMs, severity: 'medium', detectedAt: now });
  }

  return bottlenecks;
}

// ==================== SNAPSHOT ====================

export const getPerformanceSnapshot = async (req: AuthRequest, res: Response) => {
  try {
    const db = mongoose.connection.db;

    // Server metrics
    const cpus = os.cpus();
    const cpuUsage = getCpuUsage();
    const loadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 100);
    const disk = getDiskUsage();
    const uptime = os.uptime();
    const processMem = process.memoryUsage();

    // Database metrics
    let dbLatencyMs = 0;
    let collectionsCount = 0;
    let totalDocuments = 0;
    let databaseSizeBytes = 0;
    let activeConnections: number | null = null;

    if (db) {
      try {
        const pingStart = Date.now();
        await db.command({ ping: 1 });
        dbLatencyMs = Date.now() - pingStart;
      } catch {
        dbLatencyMs = -1;
      }

      try {
        const stats = await db.stats();
        collectionsCount = stats.collections;
        totalDocuments = stats.objects;
        databaseSizeBytes = stats.dataSize;
      } catch {
        // fallback
      }

      try {
        const serverStatus = await db.command({ serverStatus: 1 });
        activeConnections = serverStatus?.connections?.active ?? null;
      } catch {
        activeConnections = null;
      }
    }

    // Integration status
    const slackConfigured = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_BOT_TOKEN.startsWith('xoxb-'));
    let discordConfigured = false;
    try {
      discordConfigured = discordservice.isConfigured();
    } catch {
      discordConfigured = false;
    }
    const trelloConfigured = trelloService.isConfigured();
    const aiConfigured = !!process.env.GEMINI_API_KEY;
    const whatsappConfigured = !!process.env.WHATSAPP_PHONE_NUMBER_ID;

    const integrations = [
      { name: 'Slack', configured: slackConfigured, latencyMs: slackConfigured ? 0 : 0 },
      { name: 'Discord', configured: discordConfigured, latencyMs: discordConfigured ? 0 : 0 },
      { name: 'Trello', configured: trelloConfigured, latencyMs: trelloConfigured ? 0 : 0 },
      { name: 'AI (Gemini)', configured: aiConfigured, latencyMs: aiConfigured ? 0 : 0 },
      { name: 'WhatsApp', configured: whatsappConfigured, latencyMs: whatsappConfigured ? 0 : 0 },
    ];

    // WebSocket metrics
    let wsConnections = 0;
    try {
      const io = req.app.get('io');
      if (io?.engine) {
        wsConnections = io.engine.clientsCount || 0;
      }
    } catch {
      wsConnections = 0;
    }

    // Bottlenecks
    const bottlenecks = detectBottlenecks(cpuUsage, memPercent, disk?.usagePercent ?? null, dbLatencyMs);

    const snapshot = {
      timestamp: new Date(),
      server: {
        cpu: {
          model: cpus[0]?.model || 'Unknown',
          cores: cpus.length,
          usagePercent: cpuUsage,
          loadAvg,
        },
        memory: {
          totalBytes: totalMem,
          freeBytes: freeMem,
          usedBytes: usedMem,
          usagePercent: memPercent,
        },
        disk,
        uptimeSeconds: uptime,
        process: {
          rssBytes: processMem.rss,
          heapUsedBytes: processMem.heapUsed,
          heapTotalBytes: processMem.heapTotal,
        },
      },
      database: {
        latencyMs: dbLatencyMs,
        collectionsCount,
        totalDocuments,
        databaseSizeBytes,
        activeConnections,
      },
      integrations,
      websocket: {
        activeConnections: wsConnections,
      },
      bottlenecks,
    };

    // Persist
    try {
      await PerformanceMetric.create(snapshot);
    } catch {
      // non-critical
    }

    res.json({ success: true, data: snapshot });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo snapshot de rendimiento', error: error.message });
  }
};

// ==================== HISTORY ====================

export const getPerformanceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 24, 1), 168);
    const hours = parseInt(req.query.hours as string) || 0;

    const filter: any = {};
    if (hours > 0) {
      filter.timestamp = { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) };
    }

    const metrics = await PerformanceMetric.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, data: metrics });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo historial de rendimiento', error: error.message });
  }
};

// ==================== TRENDS ====================

export const getPerformanceTrends = async (req: AuthRequest, res: Response) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const trends = await PerformanceMetric.aggregate([
      { $match: { timestamp: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            hour: { $hour: '$timestamp' },
          },
          avgCpu: { $avg: '$server.cpu.usagePercent' },
          avgMemory: { $avg: '$server.memory.usagePercent' },
          avgDbLatency: { $avg: '$database.latencyMs' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          timestamp: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day',
              hour: '$_id.hour',
            },
          },
          avgCpu: { $round: ['$avgCpu', 1] },
          avgMemory: { $round: ['$avgMemory', 1] },
          avgDbLatency: { $round: ['$avgDbLatency', 1] },
          sampleCount: '$count',
        },
      },
      { $sort: { timestamp: 1 } },
    ]);

    res.json({ success: true, data: trends });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo tendencias de rendimiento', error: error.message });
  }
};

// ==================== ALERTS ====================

export const getPerformanceAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const metrics = await PerformanceMetric.find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    const alerts: { metric: string; value: number; severity: 'medium' | 'high'; detectedAt: Date }[] = [];

    for (const doc of metrics) {
      if (doc.bottlenecks && doc.bottlenecks.length > 0) {
        for (const b of doc.bottlenecks) {
          alerts.push({
            metric: b.metric,
            value: b.value,
            severity: b.severity,
            detectedAt: b.detectedAt,
          });
        }
      }
    }

    alerts.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());

    res.json({ success: true, data: alerts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error obteniendo alertas de rendimiento', error: error.message });
  }
};

// ==================== INTEGRATIONS ====================

export const checkIntegrationLatency = async (req: AuthRequest, res: Response) => {
  try {
    const results = [];

    // Slack
    const slackStart = Date.now();
    const slackConfigured = !!(process.env.SLACK_BOT_TOKEN && process.env.SLACK_BOT_TOKEN.startsWith('xoxb-'));
    results.push({
      name: 'Slack',
      configured: slackConfigured,
      latencyMs: Date.now() - slackStart,
      status: slackConfigured ? 'active' : 'not_configured',
    });

    // Discord
    const discordStart = Date.now();
    let discordConfigured = false;
    try {
      discordConfigured = discordservice.isConfigured();
    } catch {
      discordConfigured = false;
    }
    results.push({
      name: 'Discord',
      configured: discordConfigured,
      latencyMs: Date.now() - discordStart,
      status: discordConfigured ? 'active' : 'not_configured',
    });

    // Trello
    const trelloStart = Date.now();
    const trelloConfigured = trelloService.isConfigured();
    results.push({
      name: 'Trello',
      configured: trelloConfigured,
      latencyMs: Date.now() - trelloStart,
      status: trelloConfigured ? 'active' : 'not_configured',
    });

    // AI (Gemini)
    const aiStart = Date.now();
    const aiConfigured = !!process.env.GEMINI_API_KEY;
    results.push({
      name: 'AI (Gemini)',
      configured: aiConfigured,
      latencyMs: Date.now() - aiStart,
      status: aiConfigured ? 'active' : 'not_configured',
    });

    // WhatsApp
    const waStart = Date.now();
    const whatsappConfigured = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
    results.push({
      name: 'WhatsApp',
      configured: whatsappConfigured,
      latencyMs: Date.now() - waStart,
      status: whatsappConfigured ? 'active' : 'not_configured',
    });

    res.json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error verificando integraciones', error: error.message });
  }
};
