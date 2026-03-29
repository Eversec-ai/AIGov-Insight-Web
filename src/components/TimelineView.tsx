'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Calendar, Info, ChevronRight, Filter, ZoomIn, ZoomOut, RefreshCw, Timer, Layers } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ParsedLogEntry } from '@/types/log';
import { getDataTypeColor } from '@/lib/logParser';
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
    return str;
  }
};// 组件属性定义
interface TimelineViewProps {
  logs: ParsedLogEntry[];
  onViewLog?: (logId: string) => void;
  // 新增：外部控制的状态
  eventFilters?: EventFilter;
  timeRange?: { start: number; end: number };
  // 新增：目标会话ID，用于自动选择会话
  targetSessionId?: string | null;
  // 新增：回调函数
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onFilterChange?: (type: string) => void;
  onTimeRangeChange?: (range: { start: number; end: number }) => void;
}

interface AggregatedSession {
  id: string;
  mainEntry: ParsedLogEntry;
  allEntries: ParsedLogEntry[];
  startTime: Date;
  endTime: Date;
}

interface TimelineEvent {
  id: string;
  entry: ParsedLogEntry;
  startTime: Date;
  endTime: Date;
  duration: number;
  type: string;
}

interface TooltipData {
  isVisible: boolean;
  x: number;
  y: number;
  event: TimelineEvent | null;
}

interface EventFilter {
  [key: string]: boolean;
}

export function TimelineView({ 
  logs, 
  onViewLog,
  // 外部控制的状态
  eventFilters: externalEventFilters,
  timeRange: externalTimeRange,
  targetSessionId,
  // 回调函数
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFilterChange,
  onTimeRangeChange
}: TimelineViewProps) {
  const [aggregatedSessions, setAggregatedSessions] = useState<AggregatedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AggregatedSession | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [tooltip, setTooltip] = useState<TooltipData>({ isVisible: false, x: 0, y: 0, event: null });
  
  // 使用外部状态或内部默认值
  const [internalTimeRange, setInternalTimeRange] = useState({ start: 0, end: 0 });
  const [internalEventFilters, setInternalEventFilters] = useState<EventFilter>({
    'AG-UI': true,
    'LLM': true,
    'HTTP': true,
    'MCP': true,
    'FILE': true,
    'EXEC': true,
    'OPENCLAW': true,
    'OTHER': true
  });
  
  // 计算实际使用的状态
  // 当外部时间范围为 { start: 0, end: 0 } 时，使用内部时间范围或重新计算
  const timeRange = (externalTimeRange && externalTimeRange.start !== 0 && externalTimeRange.end !== 0) ? externalTimeRange : internalTimeRange;
  const eventFilters = externalEventFilters || internalEventFilters;
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartRange, setDragStartRange] = useState({ start: 0, end: 0 });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  // 会话搜索相关状态
  const [searchTerm, setSearchTerm] = useState('');
  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState(false);
  // 移除不必要的加载状态，因为effect执行时间很短

  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  const eventTypes = useMemo(() => [
    { name: 'AG-UI', color: 'bg-[var(--accent-blue)]', icon: '📱' },
    { name: 'OPENCLAW', color: 'bg-cyan-500', icon: '🦞' },
    { name: 'LLM', color: 'bg-purple-500', icon: '🧠' },
    { name: 'HTTP', color: 'bg-blue-400', icon: '🌐' },
    { name: 'MCP', color: 'bg-pink-400', icon: '🔌' },
    { name: 'FILE', color: 'bg-amber-400', icon: '📁' },
    { name: 'EXEC', color: 'bg-indigo-500', icon: '⚡' },
    { name: 'OTHER', color: 'bg-gray-400', icon: '⚪' },
  ], []);

  // 根据搜索词过滤会话
  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) {
      return aggregatedSessions;
    }
    const searchLower = searchTerm.toLowerCase().trim();
    return aggregatedSessions.filter(session => 
      session.mainEntry.logID.toLowerCase().includes(searchLower) ||
      session.startTime.toLocaleString().toLowerCase().includes(searchLower)
    );
  }, [aggregatedSessions, searchTerm]);

  // 添加hover背景色到CSS变量
  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--hover-background', 'rgba(0, 0, 0, 0.05)');

    // 监听主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateHoverBackground = () => {
      const isDark = mediaQuery.matches || document.documentElement.classList.contains('dark');
      style.setProperty('--hover-background', isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)');
    };

    updateHoverBackground();
    mediaQuery.addEventListener('change', updateHoverBackground);

    return () => {
      mediaQuery.removeEventListener('change', updateHoverBackground);
    };
  }, []);

  // 点击外部关闭筛选菜单和会话下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
        setIsSessionDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 关联聚合话单
  useEffect(() => {
    const sessions = aggregateSessions(logs);
    setAggregatedSessions(sessions);

    // 默认选中第一个会话或目标会话
    if (sessions.length > 0) {
      setSelectedSession(sessions[0]);
    }
  }, [logs]);

// 当目标会话ID变化时，自动选择对应的会话
useEffect(() => {
  if (!targetSessionId || !aggregatedSessions.length) return;
  
  // 查找匹配的会话
  const matchedSession = aggregatedSessions.find(session => 
    session.mainEntry.logID === targetSessionId
  );
  
  if (matchedSession) {
    setSelectedSession(matchedSession);
    // 设置搜索词为该会话的logID，以便搜索框显示
    setSearchTerm(targetSessionId);
  }
}, [targetSessionId, aggregatedSessions]);

// 当外部时间范围为 { start: 0, end: 0 } 时，重新计算时间范围
useEffect(() => {
  // 只有当外部时间范围为 { start: 0, end: 0 } 且有选中的会话时，才重新计算
  if (externalTimeRange && externalTimeRange.start === 0 && externalTimeRange.end === 0 && selectedSession) {
    // 重新处理事件，这会触发时间范围的重新计算
    const processEvents = () => {
      const events: TimelineEvent[] = [];

      selectedSession.allEntries.forEach(entry => {
        let startTime: Date;
        let endTime: Date;

        // 优先使用会话创建时间和结束时间
        if (entry.sessionCreatedAt) {
          startTime = new Date(entry.sessionCreatedAt);
        } else {
          // 否则使用collectTime
          startTime = new Date(entry.collectTime);
        }

        if (entry.sessionEndedAt) {
          endTime = new Date(entry.sessionEndedAt);
        } else {
          // 对于没有结束时间的事件，设置合理的默认持续时间
          const defaultDurations: Record<string, number> = {
            'AG-UI': 5 * 60 * 1000,
            'LLM': 30 * 1000,
            'HTTP': 5 * 1000,
            'MCP': 10 * 1000,
            'FILE': 5 * 1000,
            'EXEC': 5 * 1000,
            'OTHER': 2 * 1000
          };
          const defaultDuration = defaultDurations[entry.dataType] || 2000;
          endTime = new Date(startTime.getTime() + defaultDuration);
        }

        // 确保开始时间不晚于结束时间
        if (startTime > endTime) {
          endTime = new Date(startTime.getTime() + 1000); // 至少1秒
        }

        const duration = endTime.getTime() - startTime.getTime();

        events.push({
          id: entry.logID || Math.random().toString(36),
          entry,
          startTime,
          endTime,
          duration,
          type: entry.dataType
        });
      });

      // 按开始时间排序
      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      setTimelineEvents(events);

      // 计算所有事件的时间范围
      if (events.length > 0) {
        const allStartTimes = events.map(e => e.startTime.getTime());
        const allEndTimes = events.map(e => e.endTime.getTime());
        const minTime = Math.min(...allStartTimes);
        const maxTime = Math.max(...allEndTimes);
        const duration = maxTime - minTime;
        const margin = duration * 0.1 || 60 * 1000; // 10%的边距，至少1分钟
        
        const newRange = {
          start: minTime - margin,
          end: maxTime + margin
        };
        
        if (onTimeRangeChange) {
          onTimeRangeChange(newRange);
        } else {
          setInternalTimeRange(newRange);
        }
      } else {
        // 如果没有事件，使用主会话的时间范围
        const mainStartTime = new Date(selectedSession.startTime);
        const mainEndTime = new Date(selectedSession.endTime);
        const margin = 60 * 1000; // 1分钟边距
        
        const newRange = {
          start: mainStartTime.getTime() - margin,
          end: mainEndTime.getTime() + margin
        };
        
        if (onTimeRangeChange) {
          onTimeRangeChange(newRange);
        } else {
          setInternalTimeRange(newRange);
        }
      }
    };
    
    processEvents();
  }
}, [externalTimeRange, selectedSession, onTimeRangeChange]);

  // 移除了有问题的useEffect钩子，避免时间范围变短
  // 时间范围的计算现在完全由会话选择时的逻辑控制

  // 处理会话选择
  useEffect(() => {
    if (!selectedSession) return;

    const processEvents = () => {
      const events: TimelineEvent[] = [];

      selectedSession.allEntries.forEach(entry => {
        let startTime: Date;
        let endTime: Date;

        // 优先使用会话创建时间和结束时间
        if (entry.sessionCreatedAt) {
          startTime = new Date(entry.sessionCreatedAt);
        } else {
          // 否则使用collectTime
          startTime = new Date(entry.collectTime);
        }

        if (entry.sessionEndedAt) {
          endTime = new Date(entry.sessionEndedAt);
        } else {
          const defaultDurations: Record<string, number> = {
            'AG-UI': 5 * 60 * 1000,
            'LLM': 30 * 1000,
            'HTTP': 5 * 1000,
            'MCP': 10 * 1000,
            'FILE': 5 * 1000,
            'EXEC': 5 * 1000,
            'OTHER': 2 * 1000
          };
          const defaultDuration = defaultDurations[entry.dataType] || 2000;
          endTime = new Date(startTime.getTime() + defaultDuration);
        }

        // 确保开始时间不晚于结束时间
        if (startTime > endTime) {
          endTime = new Date(startTime.getTime() + 1000); // 至少1秒
        }

        const duration = endTime.getTime() - startTime.getTime();

        events.push({
          id: entry.logID || Math.random().toString(36),
          entry,
          startTime,
          endTime,
          duration,
          type: entry.dataType
        });
      });

      // 按开始时间排序
      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      setTimelineEvents(events);

      // 计算所有事件的时间范围，而不仅仅是主会话的时间范围
      // 这样可以确保所有事件都能在时间轴上显示
      if (events.length > 0) {
        const allStartTimes = events.map(e => e.startTime.getTime());
        const allEndTimes = events.map(e => e.endTime.getTime());
        const minTime = Math.min(...allStartTimes);
        const maxTime = Math.max(...allEndTimes);
        const duration = maxTime - minTime;
        const margin = duration * 0.1 || 60 * 1000; // 10%的边距，至少1分钟
        
        const newRange = {
          start: minTime - margin,
          end: maxTime + margin
        };
        
        if (onTimeRangeChange) {
          onTimeRangeChange(newRange);
        } else {
          setInternalTimeRange(newRange);
        }
      } else {
        // 如果没有事件，使用主会话的时间范围
        const mainStartTime = new Date(selectedSession.startTime);
        const mainEndTime = new Date(selectedSession.endTime);
        const margin = 60 * 1000; // 1分钟边距
        
        const newRange = {
          start: mainStartTime.getTime() - margin,
          end: mainEndTime.getTime() + margin
        };
        
        if (onTimeRangeChange) {
          onTimeRangeChange(newRange);
        } else {
          setInternalTimeRange(newRange);
        }
      }
    };

    processEvents();
  }, [selectedSession]);

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // 格式化日期
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // 格式化时间为更精确的格式（包含毫秒）
  const formatTimeWithMs = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      fractionalSecondDigits: 3
    });
  };

  // 计算事件在时间轴上的位置
  const calculateEventPosition = (event: TimelineEvent) => {
    const totalDuration = timeRange.end - timeRange.start;
    const eventStart = event.startTime.getTime() - timeRange.start;
    const left = (eventStart / totalDuration) * 100;
    
    // 处理开始结束时间相同的情况
    if (event.duration === 0) {
      // 固定宽度
      const width = 1.5; // 固定宽度1.5%
      return { left, width };
    }
    
    // 计算宽度，所有类型事件都按比例缩放
    const width = Math.max((event.duration / totalDuration) * 100, 1.5); // 最小宽度1.5%

    return { left, width };
  };

  // 处理缩放
  const handleZoomIn = () => {
    // 如果有外部回调，使用外部回调
    if (onZoomIn) {
      onZoomIn();
    }
  };

  const handleZoomOut = () => {
    // 如果有外部回调，使用外部回调
    if (onZoomOut) {
      onZoomOut();
    }
  };

  const handleResetZoom = () => {
    // 如果有外部回调，使用外部回调
    if (onResetZoom) {
      onResetZoom();
    }
  };

  // 处理拖动开始
  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartRange(timeRange);
  };

  // 处理拖动中
  const handleDrag = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const containerWidth = timelineContainerRef.current?.offsetWidth || 1000;
    const deltaX = e.clientX - dragStartX;
    const totalDuration = dragStartRange.end - dragStartRange.start;
    const deltaTime = (deltaX / containerWidth) * totalDuration;

    const newRange = {
      start: dragStartRange.start - deltaTime,
      end: dragStartRange.end - deltaTime
    };

    if (onTimeRangeChange) {
      onTimeRangeChange(newRange);
    } else {
      setInternalTimeRange(newRange);
    }
  };

  // 处理拖动结束
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // 处理鼠标悬停
  const handleMouseEnter = (event: TimelineEvent, e: React.MouseEvent) => {
    const containerRect = timelineRef.current?.getBoundingClientRect();

    if (containerRect) {
      setTooltip({
        isVisible: true,
        x: Math.min(e.clientX - containerRect.left + 10, (containerRect.width || 0) - 300),
        y: Math.min(e.clientY - containerRect.top + 0, (containerRect.height || 0) - 200),
        event
      });
    }
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, isVisible: false }));
  };

  // 处理事件筛选
  const handleFilterChange = (type: string) => {
    // 如果有外部回调，使用外部回调，否则修改内部状态
    if (onFilterChange) {
      onFilterChange(type);
    } else {
      setInternalEventFilters(prev => ({
        ...prev,
        [type]: !prev[type]
      }));
    }
  };

  // 处理所有事件筛选
  const handleFilterAll = (checked: boolean) => {
    const newFilters: EventFilter = {};
    eventTypes.forEach(type => {
      newFilters[type.name] = checked;
    });
    
    if (onFilterChange) {
      // 对于全选/全不选，我们需要为每个类型调用一次外部回调
      eventTypes.forEach(type => {
        if (newFilters[type.name] !== eventFilters[type.name]) {
          onFilterChange!(type.name);
        }
      });
    } else {
      setInternalEventFilters(newFilters);
    }
  };

  // 过滤后的事件类型
  const filteredEventTypes = useMemo(() => {
    return eventTypes.filter(type => eventFilters[type.name]);
  }, [eventTypes, eventFilters]);

  // 过滤后的事件 - 移除未使用的变量
  // const filteredEvents = useMemo(() => {
  //   return timelineEvents.filter(event => eventFilters[event.type]);
  // }, [timelineEvents, eventFilters]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl p-6 bg-[var(--card-background)] border border-[var(--border-color)] min-h-[600px] shadow-sm"
    >
      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <motion.div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ duration: 0.2 }}
              style={{
                boxShadow: '0 8px 16px -4px rgba(168, 85, 247, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2) inset'
              }}
            >
              <Timer className="w-5 h-5 text-white" />
            </motion.div>
            <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">时间轴视图</h3>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>会话已聚合展示</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>按时间线展示事件</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded-full">
                共 {aggregatedSessions.length} 个会话
              </span>
            </div>
          </div>
        </div>

        {/* 会话选择器 - 带搜索功能 */}
        <div className="mt-4 md:mt-0 relative" ref={filterMenuRef}>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">选择会话</label>
          <div className="relative">
            {/* 选择按钮 */}
            <button
              className="w-full md:w-115 flex items-center justify-between px-4 py-3 rounded-xl text-sm text-[var(--foreground)] transition-all duration-300 bg-[var(--card-background)]/60 backdrop-blur-xl border border-[var(--border-color)]/40 hover:bg-[var(--card-background)]/80 hover:border-[var(--accent-blue)]/30 cursor-pointer"
              style={{ boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.08)' }}
              onClick={() => setIsSessionDropdownOpen(!isSessionDropdownOpen)}
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
              <ChevronRight className={`w-4 h-4 text-[var(--text-secondary)] transition-transform duration-200 shrink-0 ml-2 ${isSessionDropdownOpen ? 'rotate-90' : ''}`} />
            </button>
            
            {/* 下拉菜单 */}
            <AnimatePresence>
              {isSessionDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute left-0 mt-2 w-full md:w-115 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  style={{
                    background: 'var(--card-background)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 24px 48px rgba(0, 0, 0, 0.3)'
                  }}
                >
                  {/* 搜索输入框 */}
                  <div className="p-3 border-b border-[var(--border-color)]/50">
                    <input
                      type="text"
                      placeholder="搜索会话ID..."
                      className="w-full px-3 py-2.5 rounded-xl bg-[var(--background)]/50 border border-[var(--border-color)]/40 text-sm text-[var(--foreground)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all duration-200"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      autoFocus
                    />
                  </div>
                  
                  {/* 会话列表 */}
                  <div className="max-h-80 overflow-y-auto p-2">
                    {filteredSessions.length === 0 ? (
                      <div className="text-center text-sm text-[var(--text-secondary)] py-8">
                        {searchTerm.trim() ? '没有找到匹配的会话' : '暂无会话数据'}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredSessions.map((session, index) => (
                          <motion.div
                            key={session.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.03 }}
                            whileHover={{ scale: 1.01, backgroundColor: 'rgba(41, 151, 255, 0.1)' }}
                            whileTap={{ scale: 0.99 }}
                            className={`px-4 py-3 rounded-xl text-sm cursor-pointer transition-all duration-200 ${
                              selectedSession?.id === session.id
                                ? 'bg-[var(--accent-blue)]/20 border border-[var(--accent-blue)]/40'
                                : 'hover:bg-[var(--background)]/50 border border-transparent'
                            }`}
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
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      {aggregatedSessions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col items-center justify-center h-[500px] text-center p-8"
        >
          <div className="w-28 h-28 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center mb-6 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow duration-300">
            <Clock className="w-14 h-14 text-[var(--accent-blue)]" />
          </div>
          <h4 className="text-xl font-semibold text-[var(--foreground)] mb-3 tracking-tight">暂无会话数据</h4>
          <p className="text-[var(--text-secondary)] max-w-md leading-relaxed">
            当有AG-UI会话产生时，时间轴视图将自动展示相关流程和事件关系。
          </p>
        </motion.div>
      ) : selectedSession ? (
        <div className="relative" ref={timelineRef}>
          {/* 时间轴标题 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-[var(--foreground)]">
                会话: {selectedSession.mainEntry.logID}
              </h4>
              <span className="text-xs text-[var(--text-secondary)]">
                时间范围: {formatTimeWithMs(selectedSession.startTime)} - {formatTimeWithMs(selectedSession.endTime)}
              </span>
            </div>
          </div>

          {/* 时间轴容器 */}
          <div className="relative">
            {/* 工具栏 - 暂时隐藏，保留代码 */}
            {false && (
            <div className="flex items-center justify-between gap-3 bg-[var(--background)] rounded-xl p-3 border border-[var(--border-color)] shadow-sm mb-4">
              {/* 左侧：主要控制 */}
              <div className="flex items-center gap-2">
                {/* 事件筛选器 */}
                <div className="relative" ref={filterMenuRef}>
                  <button
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border-color)] text-sm text-[var(--foreground)] hover:bg-[var(--hover-background)] transition-all duration-200 shadow-sm hover:shadow-md"
                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                  >
                    <Filter className="w-4 h-4" />
                    <span>筛选</span>
                  </button>

                  {/* 筛选下拉菜单 */}
                  <AnimatePresence>
                    {showFilterMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute left-0 mt-2 w-56 bg-[var(--background)] rounded-xl border border-[var(--border-color)] shadow-xl p-4 z-50"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-[var(--foreground)]">事件类型</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleFilterAll(true)}
                              className="text-xs text-[var(--accent-blue)] hover:underline hover:text-[var(--accent-blue)]/80 transition-colors"
                            >
                              全选
                            </button>
                            <button
                              onClick={() => handleFilterAll(false)}
                              className="text-xs text-[var(--accent-blue)] hover:underline hover:text-[var(--accent-blue)]/80 transition-colors"
                            >
                              全不选
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2.5">
                          {eventTypes.map(type => (
                            <div key={type.name} className="flex items-center gap-3 cursor-pointer hover:bg-[var(--hover-background)]/50 rounded-lg p-1.5 transition-colors">
                              <input
                                type="checkbox"
                                id={`filter-${type.name}`}
                                checked={eventFilters[type.name]}
                                onChange={() => handleFilterChange(type.name)}
                                className="w-4 h-4 rounded text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-[var(--background)] border-[var(--border-color)] cursor-pointer"
                              />
                              <label htmlFor={`filter-${type.name}`} className="text-xs text-[var(--foreground)] flex items-center gap-2 cursor-pointer flex-1">
                                <div className={`w-3 h-3 rounded-full ${type.color}`} />
                                <span className="flex-1 truncate">{type.name}</span>
                                <span className="text-xs font-medium text-[var(--text-secondary)]">
                                  {timelineEvents.filter(e => e.type === type.name).length}
                                </span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="w-px h-7 bg-[var(--border-color)]/50" />

                {/* 缩放控制 */}
                <div className="flex items-center gap-1 bg-[var(--background)]/50 rounded-lg p-1 border border-[var(--border-color)]">
                  <button
                    onClick={handleZoomOut}
                    className="p-2 rounded-md hover:bg-[var(--hover-background)] transition-all duration-200"
                    title="缩小"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="p-2 rounded-md hover:bg-[var(--hover-background)] transition-all duration-200"
                    title="重置缩放"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleZoomIn}
                    className="p-2 rounded-md hover:bg-[var(--hover-background)] transition-all duration-200"
                    title="放大"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 右侧：时间范围显示 */}
              <div className="flex items-center gap-2 bg-[var(--background)]/50 rounded-lg px-4 py-2 border border-[var(--border-color)]">
                <Clock className="w-4 h-4 text-[var(--accent-blue)]" />
                <div className="flex flex-col">
                  <span className="text-xs text-[var(--text-secondary)] truncate">时间范围</span>
                  <span className="text-sm font-medium text-[var(--foreground)] truncate">
                    {formatTimeWithMs(new Date(timeRange.start))} - {formatTimeWithMs(new Date(timeRange.end))}
                  </span>
                </div>
              </div>
            </div>
            )}

            {/* 时间轴图表容器 */}
            <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) var(--background)' }}>
              <div className="min-w-full">
                {/* 时间轴图表 */}
                <div
                  ref={timelineContainerRef}
                  className="bg-[var(--background)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm min-w-max hover:shadow-md transition-shadow duration-300"
                  onMouseDown={handleDragStart}
                  onMouseMove={handleDrag}
                  onMouseUp={handleDragEnd}
                  onMouseLeave={handleDragEnd}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                  {/* 事件行 */}
                  {filteredEventTypes.map((type, rowIndex) => (
                    <motion.div
                      key={type.name}
                      className="flex items-center h-18 border-b border-[var(--border-color)]/50 last:border-b-0 hover:bg-[var(--hover-background)] transition-colors duration-200"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: rowIndex * 0.05 }}
                    >
                      {/* 事件类型标签 */}
                      <div className="w-40 pl-5 pr-4 text-sm font-medium text-[var(--foreground)] flex items-center gap-2.5 shrink-0">
                        <span className="text-lg">{type.icon}</span>
                        <span className="truncate">{type.name}</span>
                        <span className="text-xs font-normal text-[var(--text-secondary)]">
                          ({timelineEvents.filter(event => event.type === type.name).length})
                        </span>
                      </div>

                      {/* 时间轴轨道 */}
                      <div className="flex-1 h-full relative overflow-hidden group">
                        {/* 背景网格线 */}
                        <div className="absolute inset-0 flex">
                          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((grid) => (
                            <div key={grid} className="w-px bg-gradient-to-b from-transparent via-[var(--border-color)]/30 to-transparent" style={{ left: `${grid * 100}%` }} />
                          ))}
                        </div>

                        {/* 中心参考线 */}
                        <div className="absolute top-0 bottom-0 left-0 w-px bg-[var(--accent-blue)]/30" />

                        {/* 事件 */}
                        {timelineEvents
                          .filter(event => event.type === type.name && eventFilters[event.type])
                          .map((event, eventIndex) => {
                            const { left, width } = calculateEventPosition(event);
                            return (
                              <motion.div
                                key={event.id}
                                className="absolute top-1/2 transform -translate-y-1/2 h-10 cursor-pointer"
                                style={{ left: `${left}%`, width: `${width}%`, minWidth: '8px' }}
                                onMouseEnter={(e) => handleMouseEnter(event, e)}
                                onMouseLeave={handleMouseLeave}
                                initial={{ opacity: 0, scaleX: 0 }}
                                animate={{ opacity: 1, scaleX: 1 }}
                                transition={{ duration: 0.6, delay: eventIndex * 0.02, ease: [0.22, 1, 0.36, 1] }}
                              >
                                <div
                                  className={`h-full rounded-xl transition-all duration-300 ${type.color} relative overflow-hidden`}
                                  style={{ opacity: 0.9 }}
                                >
                                  {/* 事件边框 */}
                                  <div className="absolute inset-0 rounded-xl border border-white/30" />
                                </div>
                              </motion.div>
                            );
                          })}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* 时间刻度容器 */}
            <div className="overflow-hidden">
              <div className="w-full">
                {/* 时间刻度 */}
                <div className="flex items-center mb-4 h-14 relative">
                  {/* 背景水平线 */}
                  <div className="absolute inset-0 bg-gradient-to-b from-[var(--border-color)]/10 via-transparent to-transparent" />
                  
                  {/* 主要时间刻度 - 智能调整数量和格式 */}
                  {(() => {
                    const ticks = [];
                    const totalDuration = timeRange.end - timeRange.start;
                    
                    // 根据时间范围智能调整刻度数量
                    let tickCount = 6;
                    if (totalDuration < 1000) { // 小于1秒
                      tickCount = 5; // 更少的刻度，避免太密集
                    } else if (totalDuration < 10000) { // 小于10秒
                      tickCount = 8; // 适当增加刻度
                    } else if (totalDuration > 3600000) { // 大于1小时
                      tickCount = 5; // 减少刻度
                    }
                    
                    // 根据时间范围选择合适的格式化函数
                    const shouldShowMs = totalDuration < 60000; // 60秒以内显示毫秒
                    
                    for (let i = 0; i < tickCount; i++) {
                      const ratio = i / (tickCount - 1);
                      const time = new Date(timeRange.start + (timeRange.end - timeRange.start) * ratio);
                      ticks.push(
                        <div key={`major-${i}`} className="absolute" style={{ left: `${ratio * 100}%` }}>
                          <div className="w-px h-8 bg-gradient-to-b from-[var(--accent-blue)]/80 via-[var(--border-color)] to-transparent" />
                          <div className="mt-2 text-xs font-medium text-[var(--foreground)] transform -translate-x-1/2 whitespace-nowrap px-2 py-1">
                            {shouldShowMs ? formatTimeWithMs(time) : formatTime(time)}
                          </div>
                        </div>
                      );
                    }
                    return ticks;
                  })()}

                  {/* 次要时间刻度 - 智能调整数量 */}
                  {(() => {
                    const ticks = [];
                    const totalDuration = timeRange.end - timeRange.start;
                    
                    // 根据时间范围智能调整次要刻度数量
                    let minorTickCount = 10;
                    if (totalDuration < 1000) { // 小于1秒
                      minorTickCount = 4; // 减少次要刻度
                    } else if (totalDuration < 10000) { // 小于10秒
                      minorTickCount = 15; // 增加次要刻度
                    } else if (totalDuration > 3600000) { // 大于1小时
                      minorTickCount = 8; // 减少次要刻度
                    }
                    
                    for (let i = 1; i < minorTickCount; i++) {
                      const ratio = i / minorTickCount;
                      ticks.push(
                        <div key={`minor-${i}`} className="absolute" style={{ left: `${ratio * 100}%` }}>
                          <div className="w-px h-4 bg-gradient-to-b from-[var(--border-color)]/50 to-transparent" />
                        </div>
                      );
                    }
                    return ticks;
                  })()}
                </div>
              </div>
            </div>

            {/* 图例 */}
            <div className="mt-6 flex flex-wrap items-center gap-5 bg-[var(--background)]/50 rounded-lg p-4 border border-[var(--border-color)]/30">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <Info className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                <span>拖拽时间轴可平移，工具栏+/-缩放可调整时间范围</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
                  <span className="text-xs text-[var(--text-secondary)]">事件</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1 h-8 bg-[var(--border-color)]/30" />
                  <span className="text-xs text-[var(--text-secondary)]">时间刻度</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1 h-8 bg-[var(--accent-blue)]/30" />
                  <span className="text-xs text-[var(--text-secondary)]">参考线</span>
                </div>
              </div>
            </div>
          </div>

          {/* 提示框 */}
          <AnimatePresence>
            {tooltip.isVisible && tooltip.event && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="fixed z-50 bg-[var(--background)]/50 rounded-xl border border-[var(--border-color)] shadow-2xl p-3 min-w-[280px] max-w-[450px] backdrop-blur-xl"
                style={{
                  left: Math.max(10, Math.min(tooltip.x + 10, window.innerWidth - 470)), // 防止超出左右两侧
                  top: (tooltip.y + 10 + 200 > window.innerHeight) ? Math.max(10, tooltip.y - 210) : Math.min(tooltip.y + 10, window.innerHeight - 200), // 智能定位：底部空间不足时向上显示
                  maxHeight: '80vh', // 限制最大高度
                  overflowY: 'auto' // 添加滚动条
                }}
                onMouseEnter={() => setTooltip(prev => ({ ...prev, isVisible: true }))}
                onMouseLeave={handleMouseLeave}
              >
                {/* 提示框头部 */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border-color)]/50">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getDataTypeColor(tooltip.event.type) }} />
                    <h5 className="text-[12px] font-semibold text-[var(--foreground)]">
                      {tooltip.event.type} 事件
                    </h5>
                  </div>
                  <div className="text-[12px] text-[var(--text-secondary)]">
                    ID: {tooltip.event.id}
                  </div>
                </div>

                {/* 基础信息 */}
                <div className="space-y-2 text-[12px] mb-3">
                  {/* FILE类型特殊处理：只显示一个时间 */}
                  {tooltip.event.type === 'FILE' ? (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1">时间</div>
                      <div className="text-[13px] font-medium text-[var(--foreground)]">{formatTimeWithMs(tooltip.event.startTime)}</div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                        <div className="text-[var(--text-secondary)] mb-1">开始时间</div>
                        <div className="text-[13px] font-medium text-[var(--foreground)]">{formatTimeWithMs(tooltip.event.startTime)}</div>
                      </div>
                      <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                        <div className="text-[var(--text-secondary)] mb-1">结束时间</div>
                        <div className="text-[13px] font-medium text-[var(--foreground)]">{formatTimeWithMs(tooltip.event.endTime)}</div>
                      </div>
                    </div>
                  )}
                  
                  {/* 非FILE类型显示持续时间 */}
                  {tooltip.event.type !== 'FILE' && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1">持续时间</div>
                      <div className="text-[13px] font-semibold text-[var(--accent-blue)]">{tooltip.event.duration}ms</div>
                    </div>
                  )}
                </div>

                {/* 事件类型特定信息 */}
                {tooltip.event.type === 'FILE' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">文件信息</div>
                    <div className="space-y-2">
                      {tooltip.event.entry.llmProvider && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">风险等级</div>
                          <span className={`px-1.5 py-0.5 rounded-full text-[12px] ${tooltip.event.entry.llmProvider === 'HIGH' ? 'bg-red-100 text-red-800' : tooltip.event.entry.llmProvider === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : tooltip.event.entry.llmProvider === 'INFO' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                            {tooltip.event.entry.llmProvider}
                          </span>
                        </div>
                      )}
                      {tooltip.event.entry.pName && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">进程名</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all">{tooltip.event.entry.pName}</div>
                        </div>
                      )}
                      {tooltip.event.entry.pid && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">PID</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.pid}</div>
                        </div>
                      )}
                      {tooltip.event.entry.answer && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">文件路径</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{decodeBase64(tooltip.event.entry.answer)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tooltip.event.type === 'EXEC' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">命令执行信息</div>
                    <div className="space-y-2">
                      {tooltip.event.entry.llmProvider && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">风险等级</div>
                          <span className={`px-1.5 py-0.5 rounded-full text-[12px] ${tooltip.event.entry.llmProvider === 'HIGH' ? 'bg-red-100 text-red-800' : tooltip.event.entry.llmProvider === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : tooltip.event.entry.llmProvider === 'INFO' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                            {tooltip.event.entry.llmProvider}
                          </span>
                        </div>
                      )}
                      {tooltip.event.entry.pName && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">进程名</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all">{tooltip.event.entry.pName}</div>
                        </div>
                      )}
                      {tooltip.event.entry.pid && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">PID</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.pid}</div>
                        </div>
                      )}
                      {tooltip.event.entry.tokenTotal && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">参数数量 (argc)</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.tokenTotal}</div>
                        </div>
                      )}
                      {(tooltip.event.entry.parsedQuery || tooltip.event.entry.query) && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">执行命令</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{tooltip.event.entry.parsedQuery || tooltip.event.entry.query}</div>
                        </div>
                      )}
                      {tooltip.event.entry.answer && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">可执行文件路径</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{decodeBase64(tooltip.event.entry.answer)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tooltip.event.type === 'AG-UI' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">AG-UI 信息</div>
                    <div className="space-y-2">
                      {/* 会话ID */}
                      <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                        <div className="text-[var(--text-secondary)] mb-1 text-[12px]">会话ID</div>
                        <div className="text-[12px] font-mono text-[var(--foreground)] break-all">{tooltip.event.entry.session || '未知'}</div>
                      </div>
                      
                      {/* 工作流信息 */}
                      {tooltip.event.entry.workflowStatus && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">工作流状态</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.workflowStatus}</div>
                        </div>
                      )}
                      
                      {/* 工作流节点 */}
                      {tooltip.event.entry.workflowNodes && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">工作流节点</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md max-h-20 overflow-y-auto">{tooltip.event.entry.workflowNodes}</div>
                        </div>
                      )}
                      
                      {/* PID */}
                      {tooltip.event.entry.pid && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">PID</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.pid}</div>
                        </div>
                      )}
                      
                      {/* 四元组信息 */}
                      {(tooltip.event.entry.reqIp || tooltip.event.entry.reqPort || tooltip.event.entry.respIp || tooltip.event.entry.respPort) && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">网络信息</div>
                          <div className="text-[12px] text-[var(--foreground)]">
                            {tooltip.event.entry.reqIp}:{tooltip.event.entry.reqPort} → {tooltip.event.entry.respIp}:{tooltip.event.entry.respPort}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tooltip.event.type === 'LLM' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">LLM 信息</div>
                    <div className="space-y-2">
                      {/* 模型名称 */}
                      {tooltip.event.entry.ModelName && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">模型</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.ModelName}</div>
                        </div>
                      )}
                      
                      {/* 提供商 */}
                      {tooltip.event.entry.llmProvider && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">提供商</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.llmProvider}</div>
                        </div>
                      )}
                      
                      {/* 提示词（简短显示） */}
                      {tooltip.event.entry.llmQuery && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">提示词</div>
                          <div className="text-[12px] text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md max-h-16 overflow-y-auto">
                            {tooltip.event.entry.llmQuery.length > 100 ? tooltip.event.entry.llmQuery.substring(0, 100) + '...' : tooltip.event.entry.llmQuery}
                          </div>
                        </div>
                      )}
                      
                      {/* Token信息 */}
                      {tooltip.event.entry.tokenTotal && parseInt(tooltip.event.entry.tokenTotal) > 0 && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">总Token</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.tokenTotal}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tooltip.event.type === 'HTTP' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">HTTP 信息</div>
                    <div className="space-y-2">
                      {/* URL */}
                      {tooltip.event.entry.answer && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">URL</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{tooltip.event.entry.answer}</div>
                        </div>
                      )}
                      
                      {/* 四元组信息 */}
                      {(tooltip.event.entry.reqIp || tooltip.event.entry.reqPort || tooltip.event.entry.respIp || tooltip.event.entry.respPort) && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">网络信息</div>
                          <div className="text-[12px] text-[var(--foreground)]">
                            {tooltip.event.entry.reqIp}:{tooltip.event.entry.reqPort} → {tooltip.event.entry.respIp}:{tooltip.event.entry.respPort}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tooltip.event.type === 'MCP' && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">MCP 信息</div>
                    <div className="space-y-2">
                      {/* 方法名 */}
                      {tooltip.event.entry.mcpMethod && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">方法</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.mcpMethod}</div>
                        </div>
                      )}
                      
                      {/* 工具名称 */}
                      {tooltip.event.entry.mcpToolName && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">工具名称</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.mcpToolName}</div>
                        </div>
                      )}
                      
                      {/* 客户端信息 */}
                      {tooltip.event.entry.mcpClientName && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">客户端</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.mcpClientName}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 其他类型 */}
                {!['FILE', 'AG-UI', 'LLM', 'HTTP', 'MCP'].includes(tooltip.event.type) && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                    <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">详细信息</div>
                    <div className="space-y-2">
                      {/* 会话ID */}
                      {tooltip.event.entry.session && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">会话ID</div>
                          <div className="text-[12px] font-mono text-[var(--foreground)] break-all">{tooltip.event.entry.session}</div>
                        </div>
                      )}
                      
                      {/* PID */}
                      {tooltip.event.entry.pid && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">PID</div>
                          <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.pid}</div>
                        </div>
                      )}
                      
                      {/* 四元组信息 */}
                      {(tooltip.event.entry.reqIp || tooltip.event.entry.reqPort || tooltip.event.entry.respIp || tooltip.event.entry.respPort) && (
                        <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                          <div className="text-[var(--text-secondary)] mb-1 text-[12px]">网络信息</div>
                          <div className="text-[12px] text-[var(--foreground)]">
                            {tooltip.event.entry.reqIp}:{tooltip.event.entry.reqPort} → {tooltip.event.entry.respIp}:{tooltip.event.entry.respPort}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* 查看详情按钮 */}
                <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                  <button
                    className="w-full text-[12px] font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] focus:outline-none transition-colors"
                    onClick={() => tooltip.event && onViewLog?.(tooltip.event.id)}
                  >
                    查看日志详情
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-col items-center justify-center h-[400px] text-center"
        >
          <p className="text-sm text-[var(--text-secondary)]">选择一个会话查看时间轴</p>
        </motion.div>
      )}
    </motion.div>
  );
}