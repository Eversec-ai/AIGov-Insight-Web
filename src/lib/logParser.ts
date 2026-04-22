import { ParsedLogEntry, LogEntry } from '@/types/log';

const LOG_SEPARATOR = '|++|';

function parseDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  // 使用正则表达式提取时间分量并创建本地时间
  const isoMatch = dateString.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (isoMatch) {
    const [, year, month, day, hour, minute, second, ms] = isoMatch;
    // 创建本地时间对象（不转换为UTC）
    const localDate = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second),
      ms ? parseInt(ms.padEnd(3, '0').slice(0, 3)) : 0
    );
    
    // 返回本地时间对象，JavaScript会自动处理时区转换
    // 当使用 getTime() 或进行时间比较时，会使用UTC时间戳
    return localDate;
  }
  
  // 如果正则匹配失败，尝试直接解析
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) return date;
  
  return new Date();
}

export function parseLogFile(content: string): ParsedLogEntry[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(LOG_SEPARATOR);
  const parsedEntries: ParsedLogEntry[] = [];

  // 遍历所有数据行（从第二行开始）
  for (let i = 1; i < lines.length; i++) {
    const dataLine = lines[i].split(LOG_SEPARATOR);
    
    const entry: LogEntry = {} as LogEntry;
    headers.forEach((header, index) => {
      const key = header.trim();
      entry[key as keyof LogEntry] = dataLine[index] || '';
    });

    // 解析更多Base64字段
    const parsed: ParsedLogEntry = {
      ...entry,
      id: entry.logID || Math.random().toString(36).substring(7),
      timestamp: parseDate(entry.collectTime),
      dataType: entry.dataType === 'UNKNOW' ? 'UNKNOWN' : (entry.dataType || 'UNKNOWN'),
      parsedQuery: entry.query ? decodeBase64(entry.query) : undefined,
      parsedAnswer: entry.answer ? decodeBase64(entry.answer) : undefined,
      parsedReqPayload: entry.reqPayload ? decodeBase64(entry.reqPayload) : undefined,
      parsedRspPayload: entry.rspPayload ? decodeBase64(entry.rspPayload) : undefined,
      // 解析更多RAG相关字段
      ragDataset: entry.ragDataset ? decodeBase64(entry.ragDataset) : entry.ragDataset,
      ragDocument: entry.ragDocument ? decodeBase64(entry.ragDocument) : entry.ragDocument,
      ragContent: entry.ragContent ? decodeBase64(entry.ragContent) : entry.ragContent,
      // 解析更多MCP相关字段
      mcpServerInst: entry.mcpServerInst ? decodeBase64(entry.mcpServerInst) : entry.mcpServerInst,
      mcpAnswer: entry.mcpAnswer ? decodeBase64(entry.mcpAnswer) : entry.mcpAnswer,
      // 解析更多LLM相关字段
      llmQuery: entry.llmQuery ? decodeBase64(entry.llmQuery) : entry.llmQuery,
      llmAnswer: entry.llmAnswer ? decodeBase64(entry.llmAnswer) : entry.llmAnswer,
    };

    parsedEntries.push(parsed);
  }

  // 按collectTime倒序排列 - 使用时间戳比较，避免时区问题
  return parsedEntries.sort((a, b) => {
    return new Date(b.collectTime).getTime() - new Date(a.collectTime).getTime();
  });
}

export function decodeBase64(encoded: string): string {
  if (!encoded || encoded.trim() === '') {
    return '';
  }
  try {
    // 清理编码字符串，去除空格和换行符
    const cleaned = encoded.trim().replace(/\s+/g, '');
    return Buffer.from(cleaned, 'base64').toString('utf-8');
  } catch (error) {
    console.error('Base64 decode error:', error, 'for encoded string:', encoded);
    return encoded;
  }
}

export function formatLatency(latency: string): string {
  const num = parseFloat(latency);
  if (isNaN(num)) return '0ms';
  return num > 1000 ? `${(num / 1000).toFixed(2)}s` : `${num.toFixed(0)}ms`;
}

export function formatTokens(tokens: string): string {
  const num = parseInt(tokens, 10);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function getDataTypeColor(dataType: string): string {
  const colors: Record<string, string> = {
    HTTP: '#3b82f6',
    LLM: '#a855f7',
    AGENT: '#eab308',
    RAG: '#f97316',
    MCP: '#ec4899',
    'AG-UI': '#14b8a6',
    WORKFLOW: '#14b8a6',
    FILE: '#eab308',
    EXEC: '#6366f1',
    TOOLCALL: '#f97316',
    OPENCLAW: '#06b6d4',
    UNKNOWN: '#6b7280',
    UNKNOW: '#6b7280',
  };
  return colors[dataType] || '#6b7280';
}

export function getDataTypeIcon(dataType: string): string {
  const icons: Record<string, string> = {
    HTTP: '🌐',
    LLM: '🤖',
    AGENT: '🎯',
    RAG: '📚',
    MCP: '🔌',
    'AG-UI': '🖥️',
    WORKFLOW: '🔄',
    FILE: '📄',
    EXEC: '⚡',
    TOOLCALL: '🔧',
    OPENCLAW: '🦞',
    UNKNOWN: '❓',
    UNKNOW: '❓',
  };
  return icons[dataType] || '❓';
}

export function getRiskLevelColor(level: string): string {
  const colors: Record<string, string> = {
    HIGH: '#ef4444',
    MEDIUM: '#f97316',
    LOW: '#eab308',
    INFO: '#22c55e',
  };
  return colors[level] || '#6b7280';
}

export function getRiskLevelBgClass(level: string): string {
  const classes: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-800',
    MEDIUM: 'bg-orange-100 text-orange-800',
    LOW: 'bg-yellow-100 text-yellow-800',
    INFO: 'bg-green-100 text-green-800',
  };
  return classes[level] || 'bg-gray-100 text-gray-800';
}
