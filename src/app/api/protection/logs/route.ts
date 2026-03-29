import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const LOGS_DIR = '/root/.openclaw/logs';

interface ProtectionLog {
  timestamp: string;
  action: 'block' | 'confirm' | 'warn';
  pattern: string;
  description: string;
  command?: string;
  session?: string;
  pid?: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const action = searchParams.get('action');
    
    const logs: ProtectionLog[] = [];
    
    try {
      const files = await fs.readdir(LOGS_DIR);
      const logFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort((a, b) => b.localeCompare(a));
      
      for (const file of logFiles.slice(0, 5)) {
        const filePath = path.join(LOGS_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            
            if (entry.event === 'protection.block' || entry.action === 'block') {
              logs.push({
                timestamp: entry.ts || entry.timestamp,
                action: 'block',
                pattern: entry.pattern || '',
                description: entry.description || entry.message || 'Blocked',
                command: entry.command || entry.argv?.join(' '),
                session: entry.session,
                pid: entry.pid,
              });
            } else if (entry.event === 'protection.confirm' || entry.action === 'confirm') {
              logs.push({
                timestamp: entry.ts || entry.timestamp,
                action: 'confirm',
                pattern: entry.pattern || '',
                description: entry.description || entry.message || 'Requires confirmation',
                command: entry.command || entry.argv?.join(' '),
                session: entry.session,
                pid: entry.pid,
              });
            } else if (entry.event === 'protection.warn' || entry.action === 'warn') {
              logs.push({
                timestamp: entry.ts || entry.timestamp,
                action: 'warn',
                pattern: entry.pattern || '',
                description: entry.description || entry.message || 'Warning',
                command: entry.command || entry.argv?.join(' '),
                session: entry.session,
                pid: entry.pid,
              });
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } catch {
      // Logs directory might not exist or be empty
    }
    
    let filteredLogs = logs;
    if (action && ['block', 'confirm', 'warn'].includes(action)) {
      filteredLogs = logs.filter(log => log.action === action);
    }
    
    filteredLogs.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    const stats = {
      total: logs.length,
      blockCount: logs.filter(l => l.action === 'block').length,
      confirmCount: logs.filter(l => l.action === 'confirm').length,
      warnCount: logs.filter(l => l.action === 'warn').length,
    };
    
    return NextResponse.json({
      success: true,
      logs: filteredLogs.slice(0, limit),
      stats,
    });
  } catch (error) {
    console.error('Error reading protection logs:', error);
    return NextResponse.json(
      { error: 'Failed to read protection logs', logs: [], stats: { total: 0, blockCount: 0, confirmCount: 0, warnCount: 0 } },
      { status: 500 }
    );
  }
}
