import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, Search, ChevronDown, Server, Network, Info, Activity, Zap, ExternalLink, GitBranch } from 'lucide-react';
import { ParsedLogEntry } from '@/types/log';
import { aggregateSessions } from '@/lib/sessionAggregator';

// BASE64解码函数 - 支持UTF-8编码
const decodeBase64 = (str: string | undefined): string => {
  if (!str) return '';
  try {
    const binaryString = atob(str);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return str || '';
  }
};

function useTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(isDarkMode);
    };
    
    checkTheme();
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          checkTheme();
        }
      });
    });
    
    observer.observe(document.documentElement, { attributes: true });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', checkTheme);
    
    return () => {
      observer.disconnect();
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', checkTheme);
    };
  }, []);

  return isDark;
}

interface SessionTimelineViewProps {
  logs: ParsedLogEntry[];
  targetSessionId?: string | null;
  onViewLog?: (logId: string) => void;
}

interface TimelineEvent {
  id: string;
  entry: ParsedLogEntry;
  type: string;
  time: Date;
  source: string;
  destination: string;
  sourcePort: string;
  destPort: string;
  direction: 'in' | 'out' | 'bidirectional';
  displayName: string;
}

interface ServerNode {
  id: string;
  ip: string;
  port: string;
  label: string;
  events: TimelineEvent[];
}

const GlassCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}> = ({ children, className = '', hoverEffect = false }) => (
  <motion.div
    whileHover={hoverEffect ? { scale: 1.01, y: -2 } : undefined}
    transition={{ duration: 0.2 }}
    className={`rounded-2xl bg-[var(--card-background)]/60 backdrop-blur-xl border border-[var(--border-color)]/40 shadow-lg ${className}`}
    style={{
      boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.05) inset'
    }}
  >
    {children}
  </motion.div>
);

const GradientBadge: React.FC<{
  children: React.ReactNode;
  color: string;
  icon?: React.ReactNode;
}> = ({ children, color, icon }) => {
  const colorMap: Record<string, { bg: string; text: string; border: string; shadow: string }> = {
    blue: {
      bg: 'linear-gradient(135deg, rgba(41, 151, 255, 0.15) 0%, rgba(41, 151, 255, 0.05) 100%)',
      text: 'var(--accent-blue)',
      border: 'rgba(41, 151, 255, 0.3)',
      shadow: 'rgba(41, 151, 255, 0.25)'
    },
    green: {
      bg: 'linear-gradient(135deg, rgba(52, 199, 89, 0.15) 0%, rgba(52, 199, 89, 0.05) 100%)',
      text: 'var(--success)',
      border: 'rgba(52, 199, 89, 0.3)',
      shadow: 'rgba(52, 199, 89, 0.25)'
    },
    purple: {
      bg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(168, 85, 247, 0.05) 100%)',
      text: '#a855f7',
      border: 'rgba(168, 85, 247, 0.3)',
      shadow: 'rgba(168, 85, 247, 0.25)'
    },
    amber: {
      bg: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(234, 179, 8, 0.05) 100%)',
      text: 'var(--warning)',
      border: 'rgba(234, 179, 8, 0.3)',
      shadow: 'rgba(234, 179, 8, 0.25)'
    }
  };

  const style = colorMap[color] || colorMap.blue;

  return (
    <motion.span
      whileHover={{ scale: 1.05 }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
      style={{
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        boxShadow: `0 2px 8px ${style.shadow}20`
      }}
    >
      {icon}
      {children}
    </motion.span>
  );
};

export function SessionTimelineView({ logs, targetSessionId, onViewLog }: SessionTimelineViewProps) {
  const isDark = useTheme();
  
  const aggregatedSessions = useMemo(() => {
    return aggregateSessions(logs);
  }, [logs]);

  const [selectedSession, setSelectedSession] = useState(aggregatedSessions[0] || null);
  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const sessionDropdownRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) {
      return aggregatedSessions;
    }
    return aggregatedSessions.filter(session => {
      return session.mainEntry.logID?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             session.mainEntry.session?.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [aggregatedSessions, searchTerm]);

  useEffect(() => {
    if (targetSessionId) {
      const session = aggregatedSessions.find(s => s.mainEntry.logID === targetSessionId);
      if (session) {
        setSelectedSession(session);
      }
    }
  }, [targetSessionId, aggregatedSessions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(event.target as Node)) {
        setIsSessionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (timelineRef.current) {
        setContainerWidth(timelineRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => {
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const timelineData = useMemo(() => {
    if (!selectedSession) return { serverNodes: [] as ServerNode[], events: [] as TimelineEvent[], portCount: 0 };

    const events: TimelineEvent[] = [];
    const serverMap = new Map<string, ServerNode>();
    const portSet = new Set<string>();

    selectedSession.allEntries.forEach(entry => {
      const time = entry.sessionCreatedAt ? new Date(entry.sessionCreatedAt) : new Date(entry.collectTime);
      
      const source = entry.reqIp || 'unknown';
      const destination = entry.respIp || 'unknown';
      const sourcePort = entry.reqPort || '0';
      const destPort = entry.respPort || '0';

      if (source === 'unknown' || destination === 'unknown') {
        return;
      }

      portSet.add(sourcePort);
      portSet.add(destPort);

      let displayName = `${entry.dataType} :${sourcePort}→:${destPort}`;
      
      if (entry.dataType === 'EXEC') {
        const cmd = entry.parsedQuery || entry.query;
        if (cmd) {
          displayName = `EXEC ${cmd}`;
        }
      } else if (entry.dataType === 'FILE') {
        const filePath = entry.parsedAnswer || entry.answer;
        if (filePath) {
          try {
            const decodedPath = atob(filePath);
            const fileName = decodedPath.split('/').pop() || decodedPath;
            displayName = `FILE ${fileName}`;
          } catch {
            displayName = `FILE ${filePath}`;
          }
        }
      }

      const event: TimelineEvent = {
        id: entry.logID || `${entry.dataType}-${entry.collectTime}-${entry.reqIp}-${entry.respIp}`,
        entry,
        type: entry.dataType,
        time,
        source,
        destination,
        sourcePort,
        destPort,
        direction: 'bidirectional',
        displayName
      };

      events.push(event);

      const sourceKey = source;
      const destKey = destination;

      if (!serverMap.has(sourceKey)) {
        serverMap.set(sourceKey, {
          id: sourceKey,
          ip: source,
          port: '',
          label: source,
          events: []
        });
      }

      if (!serverMap.has(destKey)) {
        serverMap.set(destKey, {
          id: destKey,
          ip: destination,
          port: '',
          label: destination,
          events: []
        });
      }

      serverMap.get(sourceKey)?.events.push(event);
      serverMap.get(destKey)?.events.push(event);
    });

    events.sort((a, b) => a.time.getTime() - b.time.getTime());

    const serverNodes = Array.from(serverMap.values()).sort((a, b) => {
      if (a.ip === 'unknown' && b.ip !== 'unknown') return 1;
      if (a.ip !== 'unknown' && b.ip === 'unknown') return -1;
      return a.ip.localeCompare(b.ip);
    });

    return { serverNodes, events, portCount: portSet.size };
  }, [selectedSession]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  const formatTimeWithMs = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      weekday: 'long'
    });
  };

  const calculateDuration = (startTime: Date, endTime: Date) => {
    const diff = endTime.getTime() - startTime.getTime();
    const seconds = Math.floor(diff / 1000);
    const milliseconds = diff % 1000;
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`;
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'AG-UI': return 'var(--accent-blue)';
      case 'OPENCLAW': return '#06b6d4';
      case 'LLM': return '#a855f7';
      case 'HTTP': return '#22c55e';
      case 'MCP': return '#eab308';
      case 'FILE': return '#eab308';
      case 'EXEC': return '#6366f1';
      default: return '#6b7280';
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (hoveredEvent) {
      // 定位算法：实时更新弹窗位置跟随鼠标
      // 使用 clientX/clientY 获取鼠标在视口中的坐标
      setPopupPosition({
        x: e.clientX,
        y: e.clientY
      });
    }
  }, [hoveredEvent]);

  const handleViewDetailsClick = useCallback((event: TimelineEvent) => {
    // 跳转逻辑：点击查看详情时，通过 logID 跳转到对应的日志详情
    // 需要同时满足两个条件：1. 存在 logID 2. 父组件传入了 onViewLog 回调
    if (event.entry.logID && onViewLog) {
      onViewLog(event.entry.logID);
    }
  }, [onViewLog]);

  const timelineDimensions = useMemo(() => {
    const timeAxisWidth = 110;
    const eventHeight = 56;
    const padding = 24;
    const minHeight = 600;
    const maxHeight = 1200;

    const totalHeight = Math.max(
      minHeight,
      Math.min(maxHeight, timelineData.events.length * eventHeight + padding * 2 + 60)
    );

    const availableWidth = containerWidth - timeAxisWidth - padding * 2;
    
    const serverWidth = Math.max(180, Math.min(280, availableWidth / Math.max(1, timelineData.serverNodes.length)));
    const totalWidth = timeAxisWidth + timelineData.serverNodes.length * serverWidth + padding * 2;

    return {
      timeAxisWidth,
      serverWidth,
      eventHeight,
      padding,
      totalHeight,
      totalWidth,
      getEventY: (eventIndex: number) => {
        return padding + 40 + eventIndex * eventHeight + eventHeight / 2;
      },
      getServerX: (serverIndex: number) => {
        return timeAxisWidth + padding + serverIndex * serverWidth + serverWidth / 2;
      }
    };
  }, [timelineData.events.length, timelineData.serverNodes.length, containerWidth]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[var(--card-background)]/80 to-[var(--background)]/50 backdrop-blur-2xl border border-[var(--border-color)]/30" 
           style={{ boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.05) inset' }} />
      
      <div className="relative p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col lg:flex-row lg:items-start justify-between mb-8 gap-6"
        >
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <motion.div 
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg"
                whileHover={{ scale: 1.05, rotate: 5 }}
                transition={{ duration: 0.2 }}
                style={{
                  boxShadow: '0 8px 16px -4px rgba(6, 182, 212, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2) inset'
                }}
              >
                <GitBranch className="w-5 h-5 text-white" />
              </motion.div>
              <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">会话级时序图</h3>
            </div>
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="flex flex-wrap items-center gap-3"
            >              
              <GradientBadge color="blue" icon={<Zap className="w-3.5 h-3.5" />}>
                共 {aggregatedSessions.length} 个会话
              </GradientBadge>
            </motion.div>
          </div>

          <div className="w-full md:w-115 relative" ref={sessionDropdownRef}>
            <motion.label 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="block text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider"
            >
              选择会话
            </motion.label>
            
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              <button
                onClick={() => setIsSessionDropdownOpen(!isSessionDropdownOpen)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-[var(--foreground)] transition-all duration-300 bg-[var(--card-background)]/60 backdrop-blur-xl border border-[var(--border-color)]/40 hover:bg-[var(--card-background)]/80 hover:border-[var(--accent-blue)]/30"
                style={{ boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.08)' }}
              >
                {selectedSession ? (
                  <div className="flex items-center gap-2 truncate">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 ${
                      selectedSession.mainEntry.dataType === 'AG-UI' 
                        ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' 
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {selectedSession.mainEntry.dataType}
                    </span>
                    <span className="font-medium truncate">{selectedSession.mainEntry.logID}</span>
                  </div>
                ) : (
                  <span className="text-[var(--text-secondary)]">请选择会话</span>
                )}
                <motion.div
                  animate={{ rotate: isSessionDropdownOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4 text-[var(--text-secondary)] shrink-0 ml-2" />
                </motion.div>
              </button>

              <AnimatePresence>
                {isSessionDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full left-0 right-0 mt-2 rounded-2xl shadow-2xl z-50 overflow-hidden"
                    style={{
                      background: 'var(--card-background)',
                      backdropFilter: 'blur(24px)',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 24px 48px rgba(0, 0, 0, 0.3)'
                    }}
                  >
                    <div className="p-3 border-b border-[var(--border-color)]/50">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                        <input
                          type="text"
                          placeholder="搜索会话ID..."
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--background)]/50 border border-[var(--border-color)]/40 text-sm text-[var(--foreground)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all duration-200"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto">
                      {filteredSessions.length === 0 ? (
                        <div className="text-center text-sm text-[var(--text-secondary)] py-12">
                          {searchTerm.trim() ? '没有找到匹配的会话' : '暂无会话数据'}
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {filteredSessions.map((session, index) => (
                            <motion.div
                              key={session.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.2, delay: index * 0.03 }}
                              whileHover={{ scale: 1.01, backgroundColor: 'rgba(41, 151, 255, 0.1)' }}
                              whileTap={{ scale: 0.99 }}
                              className={`px-4 py-3.5 rounded-xl text-sm cursor-pointer transition-all duration-200 ${selectedSession?.id === session.id ? 'bg-[var(--accent-blue)]/20 border border-[var(--accent-blue)]/40' : 'hover:bg-[var(--background)]/50 border border-transparent'}`}
                              onClick={() => {
                                setSelectedSession(session);
                                setIsSessionDropdownOpen(false);
                                setSearchTerm('');
                              }}
                            >
                              <div className="font-medium truncate mb-1.5 flex items-center gap-2">
                                <span className="text-[var(--foreground)]">{session.mainEntry.logID}</span>
                                {selectedSession?.id === session.id && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-2 h-2 rounded-full bg-[var(--accent-blue)] shrink-0"
                                  />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                  session.mainEntry.dataType === 'AG-UI' 
                                    ? 'bg-[var(--accent-blue)]/20 text-[var(--accent-blue)]' 
                                    : 'bg-purple-500/20 text-purple-400'
                                }`}>
                                  {session.mainEntry.dataType}
                                </span>
                                <Clock className="w-3 h-3" />
                                <span>{formatTime(session.startTime)} - {formatTime(session.endTime)}</span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>

        {aggregatedSessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center justify-center h-[500px] text-center p-8"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-28 h-28 rounded-full flex items-center justify-center mb-6"
              style={{
                background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-blue-hover) 100%)',
                boxShadow: '0 20px 48px -12px rgba(41, 151, 255, 0.35)'
              }}
            >
              <Clock className="w-14 h-14 text-white" />
            </motion.div>
            
            <motion.h4 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-2xl font-bold text-[var(--foreground)] mb-4 tracking-tight"
            >
              暂无会话数据
            </motion.h4>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="text-[var(--text-secondary)] max-w-md leading-relaxed"
            >
              当有AG-UI会话产生时，时序图将自动展示相关服务器间的流量交互关系。
            </motion.p>
          </motion.div>
        ) : selectedSession ? (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-4"
            >
              <GlassCard hoverEffect>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl" style={{ 
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
                    }}>
                      <Clock className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">持续时间</span>
                  </div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">
                    {calculateDuration(selectedSession.startTime, selectedSession.endTime)}
                  </div>
                </div>
              </GlassCard>

              <GlassCard hoverEffect>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl" style={{ 
                      background: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
                      boxShadow: '0 4px 12px rgba(168, 85, 247, 0.3)'
                    }}>
                      <Server className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">服务器数量</span>
                  </div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">
                    {timelineData.serverNodes.length}
                  </div>
                </div>
              </GlassCard>

              <GlassCard hoverEffect>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl" style={{ 
                      background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                      boxShadow: '0 4px 12px rgba(234, 179, 8, 0.3)'
                    }}>
                      <Network className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">事件总数</span>
                  </div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">
                    {selectedSession.allEntries.length}
                  </div>
                </div>
              </GlassCard>

              <GlassCard hoverEffect>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl" style={{ 
                      background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                      boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
                    }}>
                      <Activity className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">端口数量</span>
                  </div>
                  <div className="text-2xl font-bold text-[var(--foreground)]">
                    {timelineData.portCount}
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {timelineData.serverNodes.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center justify-center h-[500px] text-center"
              >
                <div className="text-sm text-[var(--text-secondary)]">
                  该会话暂无可用的流量数据
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative"
              >
                <GlassCard className="overflow-hidden !rounded-2xl">
                  <div className="relative" style={{ maxHeight: '750px' }}>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.5 }}
                      className="overflow-auto"
                      style={{ maxHeight: '750px' }}
                      ref={timelineRef}
                      onMouseMove={handleMouseMove}
                    >
                      <svg
                        width={timelineDimensions.totalWidth}
                        height={timelineDimensions.totalHeight}
                        className="block"
                        style={{
                          background: 'linear-gradient(180deg, rgba(41, 151, 255, 0.02) 0%, rgba(0, 0, 0, 0) 50%, rgba(41, 151, 255, 0.02) 100%)'
                        }}
                      >
                        <defs>
                          <pattern id="timelineGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255, 255, 255, 0.06)" strokeWidth="1" />
                          </pattern>
                          <linearGradient id="serverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--accent-blue)" />
                            <stop offset="100%" stopColor="var(--accent-blue-hover)" />
                          </linearGradient>
                          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                          <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2" result="blur" />
                            <feMerge>
                              <feMergeNode in="blur" />
                              <feMergeNode in="SourceGraphic" />
                            </feMerge>
                          </filter>
                          <filter id="serverShadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="var(--accent-blue)" floodOpacity="0.3" />
                          </filter>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#timelineGrid)" />

                        <g>
                          <text
                            x={timelineDimensions.timeAxisWidth / 2}
                            y={24}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="text-xs fill-[var(--text-secondary)] font-semibold uppercase tracking-wider"
                            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                          >
                            时间
                          </text>
                        </g>

                        {timelineData.events.map((event, eventIndex) => {
                          const y = timelineDimensions.getEventY(eventIndex);
                          const isHovered = hoveredEvent?.id === event.id;
                          return (
                            <g key={`time-label-${event.id}`}>
                              <motion.g
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: isHovered ? 1 : 0.7, x: 0 }}
                                transition={{ duration: 0.2, delay: eventIndex * 0.03 }}
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredEvent(event)}
                                onMouseLeave={() => setHoveredEvent(null)}
                              >
                                <rect
                                  x={4}
                                  y={y - 12}
                                  width={timelineDimensions.timeAxisWidth - 20}
                                  height={24}
                                  rx={6}
                                  fill={isHovered ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.08)'}
                                  stroke={isHovered ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.12)'}
                                  strokeWidth={1}
                                />
                                <text
                                  x={12}
                                  y={y + 2}
                                  dominantBaseline="middle"
                                  className="text-[11px] font-medium"
                                  style={{ 
                                    fill: isHovered ? 'white' : 'var(--text-secondary)',
                                    fontFamily: 'var(--font-mono)'
                                  }}
                                >
                                  {formatTime(event.time)}
                                </text>
                              </motion.g>
                            </g>
                          );
                        })}

                        {timelineData.serverNodes.map((server, index) => {
                          const x = timelineDimensions.getServerX(index);
                          const serverBottomPadding = 120;
                          const serverHeaderBottom = 40;
                          return (
                            <g key={server.id}>
                              <motion.rect
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: timelineDimensions.totalHeight - 60 - serverBottomPadding }}
                                transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                                x={timelineDimensions.timeAxisWidth + timelineDimensions.padding + index * timelineDimensions.serverWidth + 4}
                                y={60}
                                width={timelineDimensions.serverWidth - 8}
                                height={timelineDimensions.totalHeight - 60 - serverBottomPadding}
                                fill="rgba(255, 255, 255, 0.02)"
                                rx="12"
                                stroke="rgba(255, 255, 255, 0.05)"
                                strokeWidth="1"
                              />
                              
                              <motion.g
                                initial={{ opacity: 0, y: -15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                                whileHover={{ scale: 1.02 }}
                              >
                                <motion.rect
                                  x={timelineDimensions.timeAxisWidth + timelineDimensions.padding + index * timelineDimensions.serverWidth + 12}
                                  y={10}
                                  width={timelineDimensions.serverWidth - 24}
                                  height={36}
                                  rx={18}
                                  fill="url(#serverGradient)"
                                  style={{ filter: 'drop-shadow(0 4px 12px rgba(41, 151, 255, 0.35))' }}
                                />
                                <motion.text
                                  x={timelineDimensions.timeAxisWidth + timelineDimensions.padding + index * timelineDimensions.serverWidth + timelineDimensions.serverWidth / 2}
                                  y={28}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  className="text-[12px] fill-white font-bold"
                                  style={{ fontFamily: 'var(--font-mono)' }}
                                >
                                  {server.ip}
                                </motion.text>
                              </motion.g>
                              
                              <motion.line
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 0.3 }}
                                transition={{ duration: 0.8, delay: index * 0.08 + 0.1, ease: [0.22, 1, 0.36, 1] }}
                                x1={x}
                                y1={60}
                                x2={x}
                                y2={timelineDimensions.totalHeight - serverBottomPadding}
                                stroke="var(--accent-blue)"
                                strokeWidth="1.5"
                                strokeDasharray="4, 6"
                                opacity="0.3"
                              />
                            </g>
                          );
                        })}

                        {timelineData.events.map((event, eventIndex) => {
                          const y = timelineDimensions.getEventY(eventIndex);
                          return (
                            <g key={`time-line-${event.id}`}>
                              <motion.line
                                initial={{ x2: timelineDimensions.padding, opacity: 0 }}
                                animate={{ x2: timelineDimensions.totalWidth, opacity: 0.15 }}
                                transition={{ duration: 0.6, delay: eventIndex * 0.03, ease: [0.22, 1, 0.36, 1] }}
                                x1={timelineDimensions.timeAxisWidth}
                                y1={y}
                                x2={timelineDimensions.totalWidth}
                                y2={y}
                                stroke="rgba(255, 255, 255, 0.2)"
                                strokeWidth="1"
                                strokeDasharray="2, 6"
                              />
                            </g>
                          );
                        })}

                        {timelineData.events.map((event, eventIndex) => {
                          const y = timelineDimensions.getEventY(eventIndex);
                          const sourceIndex = timelineData.serverNodes.findIndex(s => s.ip === event.source);
                          const destIndex = timelineData.serverNodes.findIndex(s => s.ip === event.destination);
                          
                          if (sourceIndex === -1 || destIndex === -1) return null;
                          
                          const sourceX = timelineDimensions.getServerX(sourceIndex);
                          const destX = timelineDimensions.getServerX(destIndex);
                          const midX = sourceX + (destX - sourceX) / 2;
                          
                          const handleMouseEnter = (e: React.MouseEvent) => {
                            setPopupPosition({
                              x: e.clientX,
                              y: e.clientY
                            });
                            setHoveredEvent(event);
                          };
                          
                          const handleMouseLeave = () => {
                            setHoveredEvent(null);
                          };
                          
                          return (
                            <g key={event.id}>
                              <motion.line
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 0.9 }}
                                transition={{ duration: 0.6, delay: 0.05 * eventIndex, ease: [0.22, 1, 0.36, 1] }}
                                x1={sourceX}
                                y1={y}
                                x2={destX}
                                y2={y}
                                stroke={getEventTypeColor(event.type)}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                                onMouseMove={handleMouseMove}
                                className="cursor-pointer transition-all duration-200"
                                style={{ 
                                  filter: `drop-shadow(0 2px 6px ${getEventTypeColor(event.type)}40)`,
                                  opacity: hoveredEvent?.id === event.id ? 1 : 0.9
                                }}
                              />
                              
                              <motion.polygon
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.25, delay: 0.05 * eventIndex + 0.3, ease: [0.22, 1, 0.36, 1] }}
                                points={`${destX},${y} ${destX-12},${y-5} ${destX-12},${y+5}`}
                                fill={getEventTypeColor(event.type)}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                                onMouseMove={handleMouseMove}
                                className="cursor-pointer transition-all duration-200"
                                style={{ filter: `drop-shadow(0 2px 4px ${getEventTypeColor(event.type)}40)` }}
                              />
                              
                              <motion.g
                                initial={{ scale: 0, opacity: 0, y: -8 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, delay: 0.05 * eventIndex + 0.4, ease: [0.22, 1, 0.36, 1] }}
                                whileHover={{ scale: 1.08, y: -2 }}
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                                onMouseMove={handleMouseMove}
                                className="cursor-pointer"
                              >
                                <rect
                                  x={midX - 75}
                                  y={y - 16}
                                  width={150}
                                  height={28}
                                  rx={14}
                                  fill={getEventTypeColor(event.type)}
                                  style={{ filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.25))' }}
                                />
                                <text
                                  x={midX}
                                  y={y + 1}
                                  textAnchor="middle"
                                  dominantBaseline="middle"
                                  className="text-[11px] fill-white font-semibold"
                                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                                >
                                  {event.displayName.length > 20 ? event.displayName.substring(0, 20) + '...' : event.displayName}
                                </text>
                              </motion.g>
                            </g>
                          );
                        })}
                      </svg>
                    </motion.div>
                  </div>
                </GlassCard>

                <AnimatePresence>
                  {hoveredEvent && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 8 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      data-testid="timeline-popup"
                      className="fixed z-50 bg-[var(--background)]/50 rounded-xl border border-[var(--border-color)] shadow-2xl p-3 min-w-[280px] max-w-[450px] backdrop-blur-xl"
                      style={{
                        left: Math.max(10, Math.min(popupPosition.x - 150, window.innerWidth - 470)),
                        top: (popupPosition.y + 10 + 200 > window.innerHeight) ? Math.max(10, popupPosition.y - 210) : Math.min(popupPosition.y - 100, window.innerHeight - 200),
                        maxHeight: '80vh',
                        overflowY: 'auto'
                      }}
                      onMouseEnter={() => setHoveredEvent(hoveredEvent)}
                      onMouseLeave={() => setHoveredEvent(null)}
                    >
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]/50">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getEventTypeColor(hoveredEvent.type) }} />
                          <h5 className="text-[12px] font-semibold text-[var(--foreground)]">
                            {hoveredEvent.type} 事件
                          </h5>
                        </div>
                        <div className="text-[12px] text-[var(--text-secondary)]">
                          ID: {hoveredEvent.id}
                        </div>
                      </div>

                      <div className="space-y-2 text-[12px] mb-3">
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1">时间</div>
                          <div className="text-[13px] font-medium text-[var(--foreground)]">{formatTimeWithMs(hoveredEvent.time)}</div>
                        </div>
                        
                        {hoveredEvent.type === 'EXEC' && (
                          <>
                            {hoveredEvent.entry.parsedQuery && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">执行命令</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{hoveredEvent.entry.parsedQuery}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.answer && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">可执行文件路径</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)] break-all">{decodeBase64(hoveredEvent.entry.answer)}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.llmProvider && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">风险等级</div>
                                <span className={`px-1.5 py-0.5 rounded-full text-[12px] ${hoveredEvent.entry.llmProvider === 'HIGH' ? 'bg-red-100 text-red-800' : hoveredEvent.entry.llmProvider === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : hoveredEvent.entry.llmProvider === 'INFO' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                  {hoveredEvent.entry.llmProvider}
                                </span>
                              </div>
                            )}
                            {hoveredEvent.entry.tokenTotal && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">参数数量 (argc)</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.tokenTotal}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.pName && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">进程名</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)]">{hoveredEvent.entry.pName}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.pid && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">PID</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.pid}</div>
                              </div>
                            )}
                          </>
                        )}

                        {hoveredEvent.type === 'FILE' && (
                          <>
                            {hoveredEvent.entry.answer && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">文件路径</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{decodeBase64(hoveredEvent.entry.answer)}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.llmProvider && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">风险等级</div>
                                <span className={`px-1.5 py-0.5 rounded-full text-[12px] ${hoveredEvent.entry.llmProvider === 'HIGH' ? 'bg-red-100 text-red-800' : hoveredEvent.entry.llmProvider === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : hoveredEvent.entry.llmProvider === 'INFO' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                  {hoveredEvent.entry.llmProvider}
                                </span>
                              </div>
                            )}
                            {hoveredEvent.entry.pName && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">进程名</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)]">{hoveredEvent.entry.pName}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.pid && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">PID</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.pid}</div>
                              </div>
                            )}
                          </>
                        )}

                        {hoveredEvent.type === 'OPENCLAW' && (
                          <>
                            {hoveredEvent.entry.parsedQuery && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">用户提问</div>
                                <div className="text-[13px] text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md max-h-20 overflow-y-auto">{hoveredEvent.entry.parsedQuery}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.llmModel && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">大模型</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.llmModel}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.toolName && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">调用工具</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.toolName}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.tokenTotal && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">Token 数量</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.tokenTotal}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">请求</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.source}:{hoveredEvent.sourcePort}</div>
                              </div>
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">响应</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.destination}:{hoveredEvent.destPort}</div>
                              </div>
                            </div>
                            {hoveredEvent.entry.pid && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">进程</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.pName || '未知'} (PID: {hoveredEvent.entry.pid})</div>
                              </div>
                            )}
                          </>
                        )}

                        {hoveredEvent.type === 'LLM' && (
                          <>
                            {hoveredEvent.entry.ModelName && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">模型</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.ModelName}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.llmQuery && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">提示词</div>
                                <div className="text-[13px] text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md max-h-20 overflow-y-auto">{hoveredEvent.entry.llmQuery.length > 100 ? hoveredEvent.entry.llmQuery.substring(0, 100) + '...' : hoveredEvent.entry.llmQuery}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.tokenTotal && parseInt(hoveredEvent.entry.tokenTotal) > 0 && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">Token 数量</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.tokenTotal}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">请求</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.source}:{hoveredEvent.sourcePort}</div>
                              </div>
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">响应</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.destination}:{hoveredEvent.destPort}</div>
                              </div>
                            </div>
                          </>
                        )}

                        {hoveredEvent.type === 'HTTP' && (
                          <>
                            {hoveredEvent.entry.answer && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">URL</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{hoveredEvent.entry.answer}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">源地址</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.source}:{hoveredEvent.sourcePort}</div>
                              </div>
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">目标地址</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.destination}:{hoveredEvent.destPort}</div>
                              </div>
                            </div>
                          </>
                        )}

                        {hoveredEvent.type === 'MCP' && (
                          <>
                            {hoveredEvent.entry.mcpMethod && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">方法</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.mcpMethod}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.mcpToolName && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">工具名称</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.mcpToolName}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.mcpServerName && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">服务器</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.mcpServerName}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">源地址</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.source}:{hoveredEvent.sourcePort}</div>
                              </div>
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">目标地址</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.destination}:{hoveredEvent.destPort}</div>
                              </div>
                            </div>
                          </>
                        )}

                        {hoveredEvent.type === 'AG-UI' && (
                          <>
                            {hoveredEvent.entry.session && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">会话ID</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)] break-all">{hoveredEvent.entry.session}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.workflowStatus && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">工作流状态</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.workflowStatus}</div>
                              </div>
                            )}
                            {hoveredEvent.entry.workflowNodes && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">工作流节点</div>
                                <div className="text-[13px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md max-h-20 overflow-y-auto">{hoveredEvent.entry.workflowNodes}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">请求</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.source}:{hoveredEvent.sourcePort}</div>
                              </div>
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">响应</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.destination}:{hoveredEvent.destPort}</div>
                              </div>
                            </div>
                            {hoveredEvent.entry.pid && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">PID</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.pid}</div>
                              </div>
                            )}
                          </>
                        )}

                        {!['EXEC', 'FILE', 'OPENCLAW', 'LLM', 'HTTP', 'MCP', 'AG-UI'].includes(hoveredEvent.type) && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">源地址</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.source}:{hoveredEvent.sourcePort}</div>
                              </div>
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">目标地址</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.destination}:{hoveredEvent.destPort}</div>
                              </div>
                            </div>
                            {hoveredEvent.entry.pid && (
                              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                                <div className="text-[var(--text-secondary)] mb-1">进程ID</div>
                                <div className="text-[13px] font-medium text-[var(--foreground)]">{hoveredEvent.entry.pid}</div>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                        <button
                          className="w-full flex items-center justify-center gap-2 text-[12px] font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] focus:outline-none transition-colors py-2 px-3 rounded-lg hover:bg-[var(--accent-blue)]/10"
                          onClick={() => {
                            if (hoveredEvent.entry.logID && onViewLog) {
                              onViewLog(hoveredEvent.entry.logID);
                            }
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          查看详情
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[500px] text-center">
            <div className="text-sm text-[var(--text-secondary)]">
              请选择一个会话
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
