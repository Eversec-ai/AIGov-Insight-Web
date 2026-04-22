'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Info, Filter, ZoomIn, ZoomOut, RefreshCw, Globe, Search, Layers } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ParsedLogEntry } from '@/types/log';
import { getDataTypeColor } from '@/lib/logParser';

interface GlobalTimelineViewProps {
  logs: ParsedLogEntry[];
  onViewLog?: (logId: string) => void;
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

export function GlobalTimelineView({ 
  logs, 
  onViewLog
}: GlobalTimelineViewProps) {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [tooltip, setTooltip] = useState<TooltipData>({ isVisible: false, x: 0, y: 0, event: null });
  const [timeRange, setTimeRange] = useState({ start: 0, end: 0 });
  const [eventFilters, setEventFilters] = useState<EventFilter>({
    'AG-UI': true,
    'LLM': true,
    'HTTP': true,
    'MCP': true,
    'FILE': true,
    'EXEC': true,
    'TOOLCALL': true,
    'OPENCLAW': true,
    'OTHER': true
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartRange, setDragStartRange] = useState({ start: 0, end: 0 });
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  const eventTypes = useMemo(() => [
    { name: 'AG-UI', color: '#3b82f6', icon: '📱' },
    { name: 'OPENCLAW', color: '#06b6d4', icon: '🦞' },
    { name: 'LLM', color: '#8b5cf6', icon: '🧠' },
    { name: 'HTTP', color: '#60a5fa', icon: '🌐' },
    { name: 'MCP', color: '#f472b6', icon: '🔌' },
    { name: 'FILE', color: '#fbbf24', icon: '📁' },
    { name: 'EXEC', color: '#6366f1', icon: '⚡' },
    { name: 'TOOLCALL', color: '#f59e0b', icon: '🔧' },
    { name: 'OTHER', color: '#6b7280', icon: '❓' },
  ], []);

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--hover-background', 'rgba(0, 0, 0, 0.05)');

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setShowFilterMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const processEvents = () => {
      const events: TimelineEvent[] = [];

      logs.forEach(entry => {
        let startTime: Date;
        let endTime: Date;

        if (entry.sessionCreatedAt) {
          startTime = new Date(entry.sessionCreatedAt);
        } else {
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
            'TOOLCALL': 5 * 1000,
            'OTHER': 2 * 1000
          };
          const defaultDuration = defaultDurations[entry.dataType] || 2000;
          endTime = new Date(startTime.getTime() + defaultDuration);
        }

        if (startTime > endTime) {
          endTime = new Date(startTime.getTime() + 1000);
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

      events.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      setTimelineEvents(events);

      if (events.length > 0) {
        const allStartTimes = events.map(e => e.startTime.getTime());
        const allEndTimes = events.map(e => e.endTime.getTime());
        const minTime = Math.min(...allStartTimes);
        const maxTime = Math.max(...allEndTimes);
        const duration = maxTime - minTime;
        const margin = duration * 0.1 || 60 * 1000;
        
        setTimeRange({
          start: minTime - margin,
          end: maxTime + margin
        });
      }
    };

    processEvents();
  }, [logs]);

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
      hour12: false,
      fractionalSecondDigits: 3
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const calculateEventPosition = (event: TimelineEvent) => {
    const totalDuration = timeRange.end - timeRange.start;
    const eventStart = event.startTime.getTime() - timeRange.start;
    const left = (eventStart / totalDuration) * 100;
    
    if (event.duration === 0) {
      const width = 0.8;
      return { left, width };
    }
    
    const width = Math.max((event.duration / totalDuration) * 100, 0.8);
    return { left, width };
  };

  const handleZoomIn = () => {
    if (timeRange.start > 0 && timeRange.end > 0) {
      const currentDuration = timeRange.end - timeRange.start;
      const newDuration = currentDuration / 1.25;
      const centerTime = timeRange.start + currentDuration / 2;
      const newRange = {
        start: centerTime - newDuration / 2,
        end: centerTime + newDuration / 2
      };
      setTimeRange(newRange);
    }
  };

  const handleZoomOut = () => {
    if (timeRange.start > 0 && timeRange.end > 0) {
      const currentDuration = timeRange.end - timeRange.start;
      const newDuration = currentDuration * 1.25;
      const centerTime = timeRange.start + currentDuration / 2;
      const newRange = {
        start: centerTime - newDuration / 2,
        end: centerTime + newDuration / 2
      };
      setTimeRange(newRange);
    }
  };

  const handleResetZoom = () => {
    if (timelineEvents.length > 0) {
      const allStartTimes = timelineEvents.map(e => e.startTime.getTime());
      const allEndTimes = timelineEvents.map(e => e.endTime.getTime());
      const minTime = Math.min(...allStartTimes);
      const maxTime = Math.max(...allEndTimes);
      const duration = maxTime - minTime;
      const margin = duration * 0.1 || 60 * 1000;
      
      setTimeRange({
        start: minTime - margin,
        end: maxTime + margin
      });
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartRange(timeRange);
  };

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

    setTimeRange(newRange);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

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
  };

  const handleMouseEnter = (event: TimelineEvent, e: React.MouseEvent) => {
    const containerRect = timelineRef.current?.getBoundingClientRect();

    if (containerRect) {
      setTooltip({
        isVisible: true,
        x: Math.min(e.clientX - containerRect.left + 10, (containerRect.width || 0) - 300),
        y: Math.min(e.clientY - containerRect.top + -50, (containerRect.height || 0) - 200),
        event
      });
    }
  };

  const handleMouseLeave = () => {
    setTooltip(prev => ({ ...prev, isVisible: false }));
  };

  const handleFilterChange = (type: string) => {
    setEventFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const handleFilterAll = (checked: boolean) => {
    const newFilters: EventFilter = {};
    eventTypes.forEach(type => {
      newFilters[type.name] = checked;
    });
    setEventFilters(newFilters);
  };

  const filteredEventTypes = useMemo(() => {
    return eventTypes.filter(type => eventFilters[type.name]);
  }, [eventTypes, eventFilters]);

  const filteredEvents = useMemo(() => {
    let result = timelineEvents;
    
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      result = result.filter(event => 
        event.entry.logID.toLowerCase().includes(searchLower) ||
        event.entry.dataType.toLowerCase().includes(searchLower) ||
        event.entry.pName?.toLowerCase().includes(searchLower) ||
        event.entry.ModelName?.toLowerCase().includes(searchLower)
      );
    }
    
    return result.filter(event => eventFilters[event.type]);
  }, [timelineEvents, searchTerm, eventFilters]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl p-6 bg-[var(--card-background)] border border-[var(--border-color)] min-h-[600px] shadow-sm"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <motion.div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-blue-hover)] flex items-center justify-center shadow-lg"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ duration: 0.2 }}
              style={{
                boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2) inset'
              }}
            >
              <Globe className="w-5 h-5 text-white" />
            </motion.div>
            <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">全局时间轴视图</h3>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(new Date())}</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>全景展示所有话单</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] px-2 py-0.5 rounded-full">
                共 {timelineEvents.length} 个事件
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索事件..."
              className="w-48 pl-9 pr-4 py-2 rounded-lg bg-[var(--background)] border border-[var(--border-color)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all duration-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          </div>

          <motion.div 
            className="relative"
            ref={filterMenuRef}
          >
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--background)] border border-[var(--border-color)] text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:border-transparent transition-all duration-200 hover:bg-[var(--hover-background)]"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
            >
              <Filter className="w-4 h-4" />
              <span>筛选</span>
            </button>

            <AnimatePresence>
              {showFilterMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-56 bg-[var(--background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-2xl p-4 z-50 max-h-96 overflow-hidden flex flex-col"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-[var(--foreground)]">事件类型</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleFilterAll(true)}
                        className="text-xs text-[var(--accent-blue)] hover:underline transition-colors"
                      >
                        全选
                      </button>
                      <button
                        onClick={() => handleFilterAll(false)}
                        className="text-xs text-[var(--accent-blue)] hover:underline transition-colors"
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
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: type.color }}
                          />
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
          </motion.div>
        </div>
      </div>

      {timelineEvents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center justify-center h-[500px] text-center p-8"
        >
          <motion.div 
            className="w-28 h-28 rounded-full bg-[var(--accent-blue)]/10 flex items-center justify-center mb-6 backdrop-blur-sm"
            animate={{ 
              boxShadow: [
                '0 0 0 0px rgba(59, 130, 246, 0.1)',
                '0 0 0 20px rgba(59, 130, 246, 0)',
                '0 0 0 0px rgba(59, 130, 246, 0.1)'
              ],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Globe className="w-14 h-14 text-[var(--accent-blue)]" />
          </motion.div>
          <motion.h4 
            className="text-xl font-semibold text-[var(--foreground)] mb-3 tracking-tight"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            暂无事件数据
          </motion.h4>
          <motion.p 
            className="text-[var(--text-secondary)] max-w-md leading-relaxed"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            当有日志产生时，全局时间轴视图将自动展示所有话单的时间关系。
          </motion.p>
        </motion.div>
      ) : (
        <div className="relative" ref={timelineRef}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-[var(--foreground)]">
                时间范围
              </h4>
              <span className="text-xs text-[var(--text-secondary)]">
                {formatTimeWithMs(new Date(timeRange.start))} - {formatTimeWithMs(new Date(timeRange.end))}
              </span>
            </div>
            
          </div>

          <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-color) var(--background)' }}>
            <div className="min-w-full">
              <div
                ref={timelineContainerRef}
                className="bg-[var(--background)] rounded-xl border border-[var(--border-color)] overflow-hidden shadow-sm min-w-max hover:shadow-md transition-shadow duration-300"
                style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                onMouseDown={handleDragStart}
                onMouseMove={handleDrag}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
              >
                {filteredEventTypes.map((type, rowIndex) => (
                  <motion.div
                    key={type.name}
                    className="flex items-center h-16 border-b border-[var(--border-color)]/50 last:border-b-0 hover:bg-[var(--hover-background)] transition-colors duration-200"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: rowIndex * 0.05 }}
                  >
                    <div className="w-40 pl-5 pr-4 text-sm font-medium text-[var(--foreground)] flex items-center gap-2.5 shrink-0">
                      <span className="text-lg">{type.icon}</span>
                      <span className="truncate">{type.name}</span>
                      <span className="text-xs font-normal text-[var(--text-secondary)]">
                        ({filteredEvents.filter(event => event.type === type.name).length})
                      </span>
                    </div>

                    <div className="flex-1 h-full relative overflow-hidden group">
                      <div className="absolute inset-0 flex">
                        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((grid) => (
                          <div key={grid} className="w-px bg-gradient-to-b from-transparent via-[var(--border-color)]/30 to-transparent" style={{ left: `${grid * 100}%` }} />
                        ))}
                      </div>

                      <div className="absolute top-0 bottom-0 left-0 w-px bg-[var(--accent-blue)]/30" />

                      {filteredEvents
                        .filter(event => event.type === type.name)
                        .map((event, eventIndex) => {
                          const { left, width } = calculateEventPosition(event);
                          return (
                            <motion.div
                              key={event.id}
                              className="absolute top-1/2 transform -translate-y-1/2 h-8 cursor-pointer"
                              style={{ left: `${left}%`, width: `${width}%`, minWidth: '6px' }}
                              onMouseEnter={(e) => handleMouseEnter(event, e)}
                              onMouseLeave={handleMouseLeave}
                              initial={{ opacity: 0, scaleX: 0, y: 10 }}
                              animate={{ opacity: 1, scaleX: 1, y: 0 }}
                              transition={{ 
                                duration: 0.5, 
                                delay: eventIndex * 0.008, 
                                ease: [0.22, 1, 0.36, 1] 
                              }}
                            >
                              <motion.div
                                className={`h-full rounded-lg relative overflow-hidden`}
                                style={{
                                  background: type.color.replace('bg-', ''),
                                  opacity: 0.9
                                }}
                                whileHover={{
                                  opacity: 1,
                                  boxShadow: '0 8px 16px -4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.3) inset'
                                }}
                              >
                                <div className="absolute inset-0 rounded-lg border border-white/30" />
                                <motion.div 
                                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                  initial={{ x: '-100%' }}
                                  whileHover={{ x: '100%' }}
                                  transition={{ duration: 0.6 }}
                                />
                              </motion.div>
                            </motion.div>
                          );
                        })}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden">
            <div className="w-full">
              <div className="flex items-center mb-4 h-14 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-[var(--border-color)]/10 via-transparent to-transparent" />
                
                {(() => {
                  const ticks = [];
                  const totalDuration = timeRange.end - timeRange.start;
                  
                  let tickCount = 6;
                  if (totalDuration < 1000) {
                    tickCount = 5;
                  } else if (totalDuration < 10000) {
                    tickCount = 8;
                  } else if (totalDuration > 3600000) {
                    tickCount = 5;
                  }
                  
                  const shouldShowMs = totalDuration < 60000;
                  
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

                {(() => {
                  const ticks = [];
                  const totalDuration = timeRange.end - timeRange.start;
                  
                  let minorTickCount = 10;
                  if (totalDuration < 1000) {
                    minorTickCount = 4;
                  } else if (totalDuration < 10000) {
                    minorTickCount = 15;
                  } else if (totalDuration > 3600000) {
                    minorTickCount = 8;
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

          <div className="mt-6 flex flex-wrap items-center gap-5 bg-[var(--background)]/50 rounded-lg p-4 border border-[var(--border-color)]/30">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Info className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
              <span>拖拽时间轴可平移，+/-缩放可调整时间范围</span>
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
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {tooltip.isVisible && tooltip.event && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-50 bg-[var(--background)]/50 rounded-xl border border-[var(--border-color)] shadow-2xl p-3 min-w-[280px] max-w-[450px] backdrop-blur-xl"
            style={{
              left: Math.max(10, Math.min(tooltip.x + 10, window.innerWidth - 470)),
              top: (tooltip.y + 10 + 200 > window.innerHeight) ? Math.max(10, tooltip.y - 210) : Math.min(tooltip.y + 10, window.innerHeight - 200),
              maxHeight: '80vh',
              overflowY: 'auto'
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

            {tooltip.event.type === 'TOOLCALL' && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">工具调用信息</div>
                <div className="space-y-2">
                  {tooltip.event.entry.toolName && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">工具名称</div>
                      <div className="text-[12px] font-mono text-[var(--foreground)]">{tooltip.event.entry.toolName}</div>
                    </div>
                  )}
                  {tooltip.event.entry.llmProvider && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">风险等级</div>
                      <span className={`px-1.5 py-0.5 rounded-full text-[12px] ${tooltip.event.entry.llmProvider === 'HIGH' ? 'bg-red-100 text-red-800' : tooltip.event.entry.llmProvider === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                        {tooltip.event.entry.llmProvider}
                      </span>
                    </div>
                  )}
                  {tooltip.event.entry.answer && (() => {
                    const gtcStatus = decodeBase64(tooltip.event.entry.answer);
                    const statusMap: Record<string, string> = { completed: '已完成', failed: '失败', blocked: '已拦截', running: '运行中' };
                    return (
                      <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                        <div className="text-[var(--text-secondary)] mb-1 text-[12px]">调用状态</div>
                        <div className="text-[12px] font-medium text-[var(--foreground)]">{statusMap[gtcStatus] || gtcStatus}</div>
                      </div>
                    );
                  })()}
                  {tooltip.event.entry.parsedQuery && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">调用描述</div>
                      <div className="text-[12px] text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{tooltip.event.entry.parsedQuery}</div>
                    </div>
                  )}
                  {tooltip.event.entry.toolInput && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">工具参数</div>
                      <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md max-h-20 overflow-y-auto">{tooltip.event.entry.toolInput}</div>
                    </div>
                  )}
                  {tooltip.event.entry.latency && parseFloat(tooltip.event.entry.latency) > 0 && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">耗时</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{(parseFloat(tooltip.event.entry.latency)).toFixed(2)}s</div>
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
                      <div className="text-[12px] font-mono text-[var(--foreground)] break-all">{tooltip.event.entry.ModelName}</div>
                    </div>
                  )}
                  
                  {/* 调用方式 */}
                  {tooltip.event.entry['inferenceType'] && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">调用方式</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry['inferenceType']}</div>
                    </div>
                  )}
                  
                  {/* 响应状态 */}
                  {tooltip.event.entry['statusCode'] && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">状态码</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry['statusCode']}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tooltip.event.type === 'HTTP' && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">HTTP 信息</div>
                <div className="space-y-2">
                  {/* 请求方法 */}
                  {tooltip.event.entry.reqMethod && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">请求方法</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.reqMethod}</div>
                    </div>
                  )}
                  
                  {/* URL */}
                  {tooltip.event.entry.reqUrl && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">URL</div>
                      <div className="text-[12px] font-mono text-[var(--foreground)] break-all bg-[var(--hover-background)] p-1.5 rounded-md">{tooltip.event.entry.reqUrl}</div>
                    </div>
                  )}
                  
                  {/* 状态码 */}
                  {tooltip.event.entry.respStatus && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">状态码</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.respStatus}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tooltip.event.type === 'MCP' && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">MCP 信息</div>
                <div className="space-y-2">
                  {/* 组件类型 */}
                  {tooltip.event.entry.componentType && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">组件类型</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.componentType}</div>
                    </div>
                  )}
                  
                  {/* 操作类型 */}
                  {tooltip.event.entry.operationType && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">操作类型</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.operationType}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tooltip.event.type === 'OTHER' && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                <div className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">其他信息</div>
                <div className="space-y-2">
                  {/* 进程名 */}
                  {tooltip.event.entry.pName && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">进程名</div>
                      <div className="text-[12px] font-mono text-[var(--foreground)] break-all">{tooltip.event.entry.pName}</div>
                    </div>
                  )}
                  
                  {/* PID */}
                  {tooltip.event.entry.pid && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1 text-[12px]">PID</div>
                      <div className="text-[12px] font-medium text-[var(--foreground)]">{tooltip.event.entry.pid}</div>
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
    </motion.div>
  );
}
