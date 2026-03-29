import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const LOGS_DIR = '/tmp/openclaw';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface ProtectionLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  raw: string;
  subsystem?: string;
  fileName?: string;
  plugin?: string;
  category?: string;
  action?: string;
  data?: Record<string, unknown>;
}

interface ProtectionStats {
  total: number;
  block: number;
  confirm: number;
  confirmRequired: number;
  warn: number;
  allow: number;
  byTool: Record<string, { block: number; confirm: number; warn: number }>;
  recentActivity: Array<{
    timestamp: string;
    action: string;
    toolName?: string;
    message: string;
    rule?: string;
  }>;
}

const LOG_LEVEL_MAP: Record<number, LogLevel> = {
  0: 'trace',
  1: 'debug',
  2: 'info',
  3: 'info',
  4: 'warn',
  5: 'error',
  6: 'fatal',
};

const LOG_LEVEL_NAME_MAP: Record<string, LogLevel> = {
  'TRACE': 'trace',
  'DEBUG': 'debug',
  'INFO': 'info',
  'WARN': 'warn',
  'ERROR': 'error',
  'FATAL': 'fatal',
};

function parseAIGovLog(messageStr: string): {
  plugin?: string;
  category?: string;
  action?: string;
  message?: string;
  data?: Record<string, unknown>;
} | null {
  try {
    if (!messageStr.includes('AIGov-Insight')) return null;
    
    const parsed = JSON.parse(messageStr);
    return {
      plugin: parsed.plugin,
      category: parsed.category,
      action: parsed.action,
      message: parsed.message,
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

function parseLogLine(line: string): ProtectionLog | null {
  try {
    const data = JSON.parse(line);
    
    let level: LogLevel = 'info';
    
    if (data._meta?.logLevelName) {
      level = LOG_LEVEL_NAME_MAP[data._meta.logLevelName.toUpperCase()] || 'info';
    } else if (typeof data._meta?.logLevelId === 'number') {
      level = LOG_LEVEL_MAP[data._meta.logLevelId] || 'info';
    }
    
    let message = data['0'] || data.message || data.msg || '';
    
    const aigovData = typeof message === 'string' ? parseAIGovLog(message) : null;
    
    if (typeof message === 'string' && message.startsWith('{')) {
      try {
        const parsed = JSON.parse(message);
        if (parsed.subsystem) {
          message = data['1'] || message;
        }
      } catch {
        // keep original message
      }
    }
    
    if (!message && data['1']) {
      message = data['1'];
    }
    
    if (typeof message === 'object') {
      if (data['2']) {
        message = data['2'];
      } else {
        message = JSON.stringify(message);
      }
    }
    
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    const timestamp = data.time || data._meta?.date || new Date().toISOString();
    
    let subsystem: string | undefined;
    if (data._meta?.name) {
      try {
        const nameParsed = JSON.parse(data._meta.name);
        subsystem = nameParsed.subsystem;
      } catch {
        subsystem = data._meta.name;
      }
    }
    
    return {
      timestamp,
      level,
      message,
      raw: line,
      subsystem,
      fileName: data._meta?.path?.fileNameWithLine,
      plugin: aigovData?.plugin,
      category: aigovData?.category,
      action: aigovData?.action,
      data: aigovData?.data,
    };
  } catch {
    return null;
  }
}

function calculateProtectionStats(logs: ProtectionLog[]): ProtectionStats {
  const stats: ProtectionStats = {
    total: 0,
    block: 0,
    confirm: 0,
    confirmRequired: 0,
    warn: 0,
    allow: 0,
    byTool: {},
    recentActivity: [],
  };

  const aigovLogs = logs.filter(log => log.plugin === 'AIGov-Insight' && log.category === 'security');
  
  stats.total = aigovLogs.length;

  for (const log of aigovLogs) {
    const action = log.action;
    const toolName = log.data?.toolName as string | undefined;
    const rule = log.data?.rule as string | undefined;
    
    if (action === 'block') {
      stats.block++;
      if (toolName) {
        stats.byTool[toolName] = stats.byTool[toolName] || { block: 0, confirm: 0, warn: 0 };
        stats.byTool[toolName].block++;
      }
      stats.recentActivity.push({
        timestamp: log.timestamp,
        action: 'block',
        toolName,
        message: log.data?.message as string || log.message,
        rule,
      });
    } else if (action === 'confirm') {
      stats.confirm++;
      if (toolName) {
        stats.byTool[toolName] = stats.byTool[toolName] || { block: 0, confirm: 0, warn: 0 };
        stats.byTool[toolName].confirm++;
      }
      stats.recentActivity.push({
        timestamp: log.timestamp,
        action: 'confirm',
        toolName,
        message: log.data?.message as string || log.message,
        rule,
      });
    } else if (action === 'confirm_required') {
      stats.confirmRequired++;
      stats.recentActivity.push({
        timestamp: log.timestamp,
        action: 'confirm_required',
        toolName,
        message: log.data?.message as string || log.message,
        rule,
      });
    } else if (action === 'warn') {
      stats.warn++;
      if (toolName) {
        stats.byTool[toolName] = stats.byTool[toolName] || { block: 0, confirm: 0, warn: 0 };
        stats.byTool[toolName].warn++;
      }
      stats.recentActivity.push({
        timestamp: log.timestamp,
        action: 'warn',
        toolName,
        message: log.data?.message as string || log.message,
        rule,
      });
    } else if (action === 'allow') {
      stats.allow++;
    }
  }

  stats.recentActivity.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  stats.recentActivity = stats.recentActivity.slice(0, 50);

  return stats;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level');
    const limit = parseInt(searchParams.get('limit') || '100');

    const files = await fs.readdir(LOGS_DIR);
    const logFiles = files
      .filter(f => f.endsWith('.log'))
      .sort((a, b) => b.localeCompare(a));

    const allLogs: ProtectionLog[] = [];
    
    for (const file of logFiles) {
      const filePath = path.join(LOGS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      
      for (const line of lines) {
        const parsed = parseLogLine(line);
        if (parsed) {
          allLogs.push(parsed);
        }
      }
    }

    allLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let filteredLogs = allLogs;
    if (level && ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(level)) {
      filteredLogs = allLogs.filter(log => log.level === level);
    }

    const startIndex = Math.max(0, filteredLogs.length - limit);
    const paginatedLogs = filteredLogs.slice(startIndex);

    const stats = {
      total: filteredLogs.length,
      trace: filteredLogs.filter(l => l.level === 'trace').length,
      debug: filteredLogs.filter(l => l.level === 'debug').length,
      info: filteredLogs.filter(l => l.level === 'info').length,
      warn: filteredLogs.filter(l => l.level === 'warn').length,
      error: filteredLogs.filter(l => l.level === 'error').length,
      fatal: filteredLogs.filter(l => l.level === 'fatal').length,
    };

    const protectionStats = calculateProtectionStats(allLogs);

    return NextResponse.json({
      success: true,
      logs: paginatedLogs,
      stats,
      protectionStats,
    });
  } catch (error) {
    console.error('Error reading openclaw logs:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to read openclaw logs',
      logs: [],
      stats: { total: 0, trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
      protectionStats: { total: 0, block: 0, confirm: 0, confirmRequired: 0, warn: 0, allow: 0, byTool: {}, recentActivity: [] },
    }, { status: 500 });
  }
}
