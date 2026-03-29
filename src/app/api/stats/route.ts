import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseLogFile, formatLatency } from '@/lib/logParser';
import { LogStats } from '@/types/log';

const getLogsDir = () => {
  const customDir = process.env.LOGS_DIRECTORY;
  if (customDir) {
    return path.isAbsolute(customDir) ? customDir : path.join(process.cwd(), customDir);
  }
  return path.join(process.cwd(), 'logs');
};

function parseTimeFromFilename(filename: string): Date | null {
  const match = filename.match(/-(\d{14})-/);
  if (!match) return null;
  
  const timeStr = match[1];
  const year = parseInt(timeStr.substring(0, 4), 10);
  const month = parseInt(timeStr.substring(4, 6), 10) - 1;
  const day = parseInt(timeStr.substring(6, 8), 10);
  const hour = parseInt(timeStr.substring(8, 10), 10);
  const minute = parseInt(timeStr.substring(10, 12), 10);
  const second = parseInt(timeStr.substring(12, 14), 10);
  
  const date = new Date(year, month, day, hour, minute, second);
  if (isNaN(date.getTime())) return null;
  
  return date;
}

function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

export async function GET(request: NextRequest) {
  try {
    const LOGS_DIR = getLogsDir();
    const files = await fs.readdir(LOGS_DIR);
    const logFiles = files.filter(f => f.endsWith('.txt'));
    
    const searchParams = request.nextUrl.searchParams;
    const startTimeStr = searchParams.get('startTime');
    const endTimeStr = searchParams.get('endTime');
    
    const startTime = startTimeStr ? new Date(startTimeStr) : null;
    const endTime = endTimeStr ? new Date(endTimeStr) : null;

    const stats: LogStats = {
      totalRequests: 0,
      totalTokens: 0,
      averageLatency: 0,
      activeSessions: 0,
      requestsByType: {},
      requestsByHour: [],
    };

    const minuteData: Record<string, number> = {};
    const latencies: number[] = [];
    const sessions = new Set<string>();
    let AGUIRequestCount = 0;

    let filesToProcess = logFiles;
    
    if (startTime && endTime) {
      const startTimeMs = startTime.getTime();
      const endTimeMs = endTime.getTime();
      
      filesToProcess = [];
      for (const file of logFiles) {
        const fileTime = parseTimeFromFilename(file);
        if (fileTime) {
          const fileTimeMs = fileTime.getTime();
          if (fileTimeMs >= startTimeMs && fileTimeMs <= endTimeMs) {
            filesToProcess.push(file);
          }
        }
      }
    }

    for (const file of filesToProcess) {
      const filePath = path.join(LOGS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const logs = parseLogFile(content);

      logs.forEach(log => {
        const logTime = new Date(log.collectTime);
        if (startTime && endTime) {
          if (logTime < startTime || logTime > endTime) {
            return;
          }
        }
        
        stats.totalRequests++;
        
        let dataType = log.dataType || 'UNKNOWN';
        if (dataType === 'UNKNOW') {
          dataType = 'UNKNOWN';
        }
        stats.requestsByType[dataType] = (stats.requestsByType[dataType] || 0) + 1;

        const tokens = parseInt(log.tokenTotal || '0', 10);
        stats.totalTokens += tokens;

        const latency = parseFloat(log.latency || '0');
        if (!isNaN(latency) && latency > 0) {
          latencies.push(latency);
        }

        if (log.session) {
          sessions.add(log.session);
        }

        if (dataType && dataType == 'AG-UI') {
          AGUIRequestCount++;
        }

        if (isValidDate(log.timestamp)) {
          const year = log.timestamp.getFullYear();
          const month = String(log.timestamp.getMonth() + 1).padStart(2, '0');
          const day = String(log.timestamp.getDate()).padStart(2, '0');
          const hour = String(log.timestamp.getHours()).padStart(2, '0');
          const minute = String(log.timestamp.getMinutes()).padStart(2, '0');
          const localMinute = `${year}-${month}-${day}T${hour}:${minute}`;
          minuteData[localMinute] = (minuteData[localMinute] || 0) + 1;
        }
      });
    }

    stats.averageLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    stats.activeSessions = AGUIRequestCount;

    stats.requestsByHour = Object.entries(minuteData)
      .map(([minute, count]) => ({ hour: minute, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
      .slice(-60);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error calculating stats:', error);
    return NextResponse.json(
      { error: 'Failed to calculate stats' },
      { status: 500 }
    );
  }
}
