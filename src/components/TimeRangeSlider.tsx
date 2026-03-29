'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronLeft, ChevronRight, RefreshCw, Calendar, ZoomIn, ZoomOut, Loader2, Edit3 } from 'lucide-react';
import { TimePickerDialog } from './TimePickerDialog';
import { useTheme } from '@/context/ThemeContext';

const FORMAT_1H = 60 * 60 * 1000;
const TIME_BUFFER = 1 * 60 * 1000;

const formatTime = (date: Date) => {
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

const formatDateTime = (date: Date) => {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }) + `.${String(date.getMilliseconds()).padStart(3, '0')}`;
};

const formatDuration = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
};

const formatCompactDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

interface TimeRangeSliderProps {
  startTime: Date;
  endTime: Date;
  initialRange?: { start: Date; end: Date };
  onTimeRangeChange: (range: { start: Date; end: Date }) => void;
  onTimeRangeChangeEnd?: () => void;
  autoRefresh?: boolean;
}

interface FileTimeRange {
  filename: string;
  startTime: Date;
  endTime: Date;
  size: number;
  lineCount: number;
}

export function TimeRangeSlider({ startTime, endTime, initialRange, onTimeRangeChange, onTimeRangeChangeEnd, autoRefresh = false }: TimeRangeSliderProps) {
  const { isDarkMode } = useTheme();
  const adjustedEndTime = useMemo(() => new Date(endTime.getTime() + TIME_BUFFER), [endTime]);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isInitializedRef = useRef(false);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'range' | 'scrollbar' | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const [range, setRange] = useState(() => {
    if (initialRange) {
      return { start: initialRange.start, end: initialRange.end };
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai-sec-timeline-range');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const savedStart = new Date(parsed.start);
          const savedEnd = new Date(parsed.end);
          if (savedStart >= new Date(startTime.getTime() - 24 * 60 * 60 * 1000) &&
              savedEnd <= new Date(adjustedEndTime.getTime() + 24 * 60 * 60 * 1000)) {
            return { start: savedStart, end: savedEnd };
          }
        } catch (e) {
          console.error('Failed to parse saved timeline range:', e);
        }
      }
    }
    return {
      start: new Date(adjustedEndTime.getTime() - 5 * 60 * 1000),
      end: adjustedEndTime
    };
  });

  const [mouseStartX, setMouseStartX] = useState(0);
  const [startDragPos, setStartDragPos] = useState({ start: range.start, end: range.end });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLeftHandleHovered, setIsLeftHandleHovered] = useState(false);
  const [isRightHandleHovered, setIsRightHandleHovered] = useState(false);

  const [timelineStart, setTimelineStart] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai-sec-timeline-start');
      if (saved) {
        try {
          const savedStart = new Date(JSON.parse(saved));
          if (savedStart >= new Date(startTime.getTime() - 24 * 60 * 60 * 1000) &&
              savedStart <= new Date(adjustedEndTime.getTime() + 24 * 60 * 60 * 1000)) {
            return savedStart;
          }
        } catch (e) {
          console.error('Failed to parse saved timeline start:', e);
        }
      }
    }
    return new Date(adjustedEndTime.getTime() - FORMAT_1H);
  });

  const [timelineDuration, setTimelineDuration] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai-sec-timeline-duration');
      if (saved) {
        try {
          const savedDuration = JSON.parse(saved);
          if (typeof savedDuration === 'number' && savedDuration > 0) {
            return savedDuration;
          }
        } catch (e) {
          console.error('Failed to parse saved timeline duration:', e);
        }
      }
    }
    return FORMAT_1H;
  });

  const [isScrollbarHovered, setIsScrollbarHovered] = useState(false);
  const [isScrollbarDragging, setIsScrollbarDragging] = useState(false);
  const scrollbarDragStartPercentRef = useRef(0);
  const timePickerButtonRef = useRef<HTMLButtonElement>(null);

  const [fileTimeRanges, setFileTimeRanges] = useState<FileTimeRange[]>([]);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

  const rangeRef = useRef(range);
  const timelineStartRef = useRef(timelineStart);
  const timelineDurationRef = useRef(timelineDuration);

  useEffect(() => { rangeRef.current = range; }, [range]);
  useEffect(() => { timelineStartRef.current = timelineStart; }, [timelineStart]);
  useEffect(() => { timelineDurationRef.current = timelineDuration; }, [timelineDuration]);

  const totalDuration = useMemo(() => adjustedEndTime.getTime() - startTime.getTime(), [startTime, adjustedEndTime]);
  const rangeDuration = useMemo(() => range.end.getTime() - range.start.getTime(), [range.start, range.end]);
  const timelineEnd = useMemo(() => new Date(timelineStart.getTime() + timelineDuration), [timelineStart, timelineDuration]);

  const startPercent = useMemo(() => {
    if (timelineDuration === 0) return 0;
    return ((range.start.getTime() - timelineStart.getTime()) / timelineDuration) * 100;
  }, [range.start, timelineStart, timelineDuration]);

  const endPercent = useMemo(() => {
    if (timelineDuration === 0) return 100;
    return ((range.end.getTime() - timelineStart.getTime()) / timelineDuration) * 100;
  }, [range.end, timelineStart, timelineDuration]);

  const rangeWidth = useMemo(() => endPercent - startPercent, [endPercent, startPercent]);

  const scrollbarWidthPercent = useMemo(() => {
    if (totalDuration === 0) return 100;
    return Math.min(100, (timelineDuration / totalDuration) * 100);
  }, [timelineDuration, totalDuration]);

  const scrollbarStartPercent = useMemo(() => {
    if (totalDuration === 0) return 0;
    const availableSpace = totalDuration - timelineDuration;
    if (availableSpace <= 0) return 0;
    const currentStart = timelineStart.getTime() - startTime.getTime();
    return Math.min(100 - scrollbarWidthPercent, Math.max(0, (currentStart / availableSpace) * 100));
  }, [timelineStart, startTime, totalDuration, timelineDuration, scrollbarWidthPercent]);

  const fetchMetadata = useCallback(async () => {
    try {
      setIsLoadingMetadata(true);
      const response = await fetch('/api/logs/metadata');
      const data = await response.json();
      
      if (data.files && data.files.length > 0) {
        const convertedFiles = data.files.map((file: any) => ({
          filename: file.filename,
          startTime: new Date(file.startTime),
          endTime: new Date(file.endTime),
          size: file.size || 0,
          lineCount: file.lineCount || 0
        }));
        setFileTimeRanges(convertedFiles);
      }
    } catch (error) {
      console.error('Failed to fetch logs metadata:', error);
    } finally {
      setIsLoadingMetadata(false);
    }
  }, []);

  useEffect(() => { fetchMetadata(); }, [fetchMetadata]);

  const handleMouseDown = useCallback((type: 'start' | 'end' | 'range' | 'scrollbar', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(type);
    setMouseStartX(e.clientX);
    setStartDragPos(range);
    if (type === 'scrollbar') {
      scrollbarDragStartPercentRef.current = scrollbarStartPercent;
      setIsScrollbarDragging(true);
    }
  }, [range, scrollbarStartPercent]);

  const animationFrameRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    animationFrameRef.current = requestAnimationFrame(() => {
      const containerWidth = containerRef.current!.offsetWidth;
      const deltaX = e.clientX - mouseStartX;
      const timePerPixel = timelineDuration / containerWidth;
      const deltaTime = deltaX * timePerPixel;

      let newStart = startDragPos.start;
      let newEnd = startDragPos.end;

      if (isDragging === 'scrollbar') {
        const scrollbarTrackWidth = scrollbarRef.current!.offsetWidth;
        const deltaPercent = deltaX / scrollbarTrackWidth;
        const basePercent = scrollbarDragStartPercentRef.current;
        const newScrollbarStartPercent = Math.max(0, Math.min(100 - scrollbarWidthPercent, basePercent + deltaPercent * 100));
        const availableSpace = totalDuration - timelineDuration;
        const newTimelineStartMs = startTime.getTime() + (newScrollbarStartPercent / 100) * availableSpace;
        const newTimelineStart = new Date(newTimelineStartMs);
        setTimelineStart(newTimelineStart);
        const rangeOffset = range.start.getTime() - timelineStart.getTime();
        setRange({
          start: new Date(newTimelineStart.getTime() + rangeOffset),
          end: new Date(newTimelineStart.getTime() + (range.end.getTime() - timelineStart.getTime()))
        });
      } else if (isDragging === 'start') {
        const potentialNewStart = new Date(startDragPos.start.getTime() + deltaTime);
        newStart = new Date(Math.max(potentialNewStart.getTime(), timelineStart.getTime()));
        newEnd = new Date(Math.max(newStart.getTime() + 1000, startDragPos.end.getTime()));
        setRange({ start: newStart, end: newEnd });
      } else if (isDragging === 'end') {
        const potentialNewEnd = new Date(startDragPos.end.getTime() + deltaTime);
        newEnd = new Date(Math.min(potentialNewEnd.getTime(), timelineEnd.getTime()));
        newStart = new Date(Math.min(newEnd.getTime() - 1000, startDragPos.start.getTime()));
        setRange({ start: newStart, end: newEnd });
      } else if (isDragging === 'range') {
        const rangeDur = startDragPos.end.getTime() - startDragPos.start.getTime();
        const potentialNewStartTime = startDragPos.start.getTime() + deltaTime;
        const potentialNewEndTime = startDragPos.end.getTime() + deltaTime;
        newStart = new Date(Math.max(potentialNewStartTime, timelineStart.getTime()));
        newEnd = new Date(Math.min(potentialNewEndTime, timelineEnd.getTime()));
        const newDuration = newEnd.getTime() - newStart.getTime();
        if (newDuration < rangeDur) {
          if (potentialNewStartTime < timelineStart.getTime()) {
            newStart = timelineStart;
            newEnd = new Date(timelineStart.getTime() + rangeDur);
          } else {
            newEnd = timelineEnd;
            newStart = new Date(timelineEnd.getTime() - rangeDur);
          }
        }
        setRange({ start: newStart, end: newEnd });
      }
    });
  }, [isDragging, mouseStartX, startDragPos, timelineStart, timelineEnd, timelineDuration, startTime, adjustedEndTime, totalDuration, range, scrollbarWidthPercent]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const moveLeft = useCallback(() => {
    const maxMove = timelineStart.getTime() - startTime.getTime();
    if (maxMove <= 0) return;
    const dur = Math.min(timelineDuration * 0.2, maxMove);
    const newTimelineStart = new Date(timelineStart.getTime() - dur);
    setTimelineStart(newTimelineStart);
    const newRangeStart = new Date(range.start.getTime() - dur);
    const newRangeEnd = new Date(range.end.getTime() - dur);
    setRange({ start: newRangeStart, end: newRangeEnd });
    saveTimelineState();
  }, [timelineStart, timelineDuration, range, startTime]);

  const moveRight = useCallback(() => {
    const maxMove = adjustedEndTime.getTime() - timelineEnd.getTime();
    if (maxMove <= 0) return;
    const dur = Math.min(timelineDuration * 0.2, maxMove);
    const newTimelineStart = new Date(timelineStart.getTime() + dur);
    setTimelineStart(newTimelineStart);
    const newRangeStart = new Date(range.start.getTime() + dur);
    const newRangeEnd = new Date(range.end.getTime() + dur);
    setRange({ start: newRangeStart, end: newRangeEnd });
    saveTimelineState();
  }, [timelineStart, timelineEnd, timelineDuration, range, adjustedEndTime]);

  const toggleExpand = useCallback(() => { setIsExpanded(prev => !prev); }, []);

  const saveTimelineState = useCallback(() => {
    if (typeof window !== 'undefined' && !isFirstLoad) {
      try {
        localStorage.setItem('ai-sec-timeline-range', JSON.stringify({
          start: rangeRef.current.start.toISOString(),
          end: rangeRef.current.end.toISOString()
        }));
        localStorage.setItem('ai-sec-timeline-start', JSON.stringify(timelineStartRef.current.toISOString()));
        localStorage.setItem('ai-sec-timeline-duration', JSON.stringify(timelineDurationRef.current));
      } catch (e) {
        console.error('Failed to save timeline state to localStorage:', e);
      }
    }
  }, [isFirstLoad]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setIsDragging(null);
      setIsScrollbarDragging(false);
      onTimeRangeChange(range);
      saveTimelineState();
      if (onTimeRangeChangeEnd) onTimeRangeChangeEnd();
    }
  }, [isDragging, range, onTimeRangeChange, saveTimelineState, onTimeRangeChangeEnd]);

  const handleMouseLeave = useCallback(() => { }, []);

  const decreaseTimelineRange = useCallback(() => {
    const oldTimelineStart = timelineStart.getTime();
    const oldTimelineEnd = timelineEnd.getTime();
    const oldCenter = (oldTimelineStart + oldTimelineEnd) / 2;
    const newDuration = Math.max(timelineDuration * 0.75, 5 * 60 * 1000);
    const newStart = new Date(oldCenter - newDuration / 2);
    const newEnd = new Date(oldCenter + newDuration / 2);
    let finalStart = newStart.getTime();
    let finalEnd = newEnd.getTime();
    if (finalStart < startTime.getTime()) { finalStart = startTime.getTime(); finalEnd = finalStart + newDuration; }
    if (finalEnd > adjustedEndTime.getTime()) { finalEnd = adjustedEndTime.getTime(); finalStart = Math.max(startTime.getTime(), finalEnd - newDuration); }
    const actualDuration = Math.min(finalEnd - finalStart, totalDuration);
    const finalTimelineStart = new Date(finalStart);
    setTimelineDuration(actualDuration);
    setTimelineStart(finalTimelineStart);
    let newRangeStart = range.start.getTime();
    let newRangeEnd = range.end.getTime();
    if (newRangeStart < finalTimelineStart.getTime()) newRangeStart = finalTimelineStart.getTime();
    if (newRangeEnd > finalTimelineStart.getTime() + actualDuration) newRangeEnd = finalTimelineStart.getTime() + actualDuration;
    if (newRangeEnd - newRangeStart < 1000) { newRangeStart = finalTimelineStart.getTime(); newRangeEnd = finalTimelineStart.getTime() + 1000; }
    setRange({ start: new Date(newRangeStart), end: new Date(newRangeEnd) });
    onTimeRangeChange({ start: new Date(newRangeStart), end: new Date(newRangeEnd) });
    saveTimelineState();
  }, [timelineStart, timelineEnd, timelineDuration, range, startTime, adjustedEndTime, totalDuration, onTimeRangeChange, saveTimelineState]);

  const increaseTimelineRange = useCallback(() => {
    const oldTimelineStart = timelineStart.getTime();
    const oldTimelineEnd = timelineEnd.getTime();
    const oldCenter = (oldTimelineStart + oldTimelineEnd) / 2;
    const maxDuration = Math.min(timelineDuration * 1.25, totalDuration);
    const newDuration = maxDuration;
    const newStart = new Date(oldCenter - newDuration / 2);
    const newEnd = new Date(oldCenter + newDuration / 2);
    let finalStart = newStart.getTime();
    let finalEnd = newEnd.getTime();
    if (finalStart < startTime.getTime()) { finalStart = startTime.getTime(); finalEnd = finalStart + newDuration; }
    if (finalEnd > adjustedEndTime.getTime()) { finalEnd = adjustedEndTime.getTime(); finalStart = Math.max(startTime.getTime(), finalEnd - newDuration); }
    const actualDuration = Math.min(finalEnd - finalStart, totalDuration);
    const finalTimelineStart = new Date(finalStart);
    setTimelineDuration(actualDuration);
    setTimelineStart(finalTimelineStart);
    let newRangeStart = range.start.getTime();
    let newRangeEnd = range.end.getTime();
    if (newRangeStart < finalTimelineStart.getTime()) newRangeStart = finalTimelineStart.getTime();
    if (newRangeEnd > finalTimelineStart.getTime() + actualDuration) newRangeEnd = finalTimelineStart.getTime() + actualDuration;
    if (newRangeEnd - newRangeStart < 1000) { newRangeStart = finalTimelineStart.getTime(); newRangeEnd = finalTimelineStart.getTime() + 1000; }
    setRange({ start: new Date(newRangeStart), end: new Date(newRangeEnd) });
    onTimeRangeChange({ start: new Date(newRangeStart), end: new Date(newRangeEnd) });
    saveTimelineState();
  }, [timelineStart, timelineEnd, timelineDuration, range, startTime, adjustedEndTime, totalDuration, onTimeRangeChange, saveTimelineState]);

  useEffect(() => {
    if (range.start < timelineStart || range.end > timelineEnd) {
      const newRange = {
        start: new Date(Math.max(range.start.getTime(), timelineStart.getTime())),
        end: new Date(Math.min(range.end.getTime(), timelineEnd.getTime()))
      };
      setRange(newRange);
      onTimeRangeChange(newRange);
      if (!isFirstLoad) saveTimelineState();
    }
  }, [timelineStart, timelineEnd, range, onTimeRangeChange, isFirstLoad, saveTimelineState]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      onTimeRangeChange(range);
    }
  }, [onTimeRangeChange, range]);

  useEffect(() => {
    const timer = setTimeout(() => setIsFirstLoad(false), 100);
    return () => clearTimeout(timer);
  }, []);

  const prevEndTimeRef = useRef<Date | null>(null);
  const prevTotalDurationRef = useRef(totalDuration);
  const rangeDurationRef = useRef(range.end.getTime() - range.start.getTime());

  useEffect(() => {
    if (autoRefresh && !isDragging && prevEndTimeRef.current) {
      const prevEndTime = prevEndTimeRef.current.getTime();
      const currentEndTime = adjustedEndTime.getTime();
      const prevTotalDuration = prevTotalDurationRef.current;
      
      if (currentEndTime > prevEndTime) {
        const duration = rangeDurationRef.current;
        const maxDuration = Math.min(timelineDuration, totalDuration);
        const scrollbarPosPercent = scrollbarStartPercent;
        const scrollbarWidth = scrollbarWidthPercent;
        const wasAtRightEdge = scrollbarPosPercent >= 100 - scrollbarWidth - 1;
        let newTimelineStartMs;
        if (wasAtRightEdge && totalDuration > prevTotalDuration) {
          newTimelineStartMs = Math.max(startTime.getTime(), currentEndTime - maxDuration);
        } else if (scrollbarStartPercent > 0 && scrollbarStartPercent < 100 - scrollbarWidthPercent) {
          const availableSpace = prevTotalDuration - timelineDuration;
          if (availableSpace > 0) {
            const currentStartMs = startTime.getTime() + (scrollbarStartPercent / 100) * availableSpace;
            newTimelineStartMs = Math.max(startTime.getTime(), Math.min(currentEndTime - maxDuration, currentStartMs));
          } else {
            newTimelineStartMs = currentEndTime - maxDuration;
          }
        } else {
          newTimelineStartMs = Math.max(startTime.getTime(), currentEndTime - maxDuration);
        }
        if (newTimelineStartMs < startTime.getTime()) newTimelineStartMs = startTime.getTime();
        const newTimelineStart = new Date(newTimelineStartMs);
        let newRangeStart = currentEndTime - duration;
        let newRangeEnd = currentEndTime;
        if (newRangeStart < newTimelineStartMs) newRangeStart = newTimelineStartMs;
        if (newRangeEnd > newTimelineStartMs + maxDuration) newRangeEnd = newTimelineStartMs + maxDuration;
        const newRange = { start: new Date(newRangeStart), end: new Date(newRangeEnd) };
        setRange(newRange);
        setTimelineStart(newTimelineStart);
        setTimelineDuration(maxDuration);
        onTimeRangeChange(newRange);
        if (!isFirstLoad) saveTimelineState();
      }
    }
    prevEndTimeRef.current = adjustedEndTime;
    prevTotalDurationRef.current = totalDuration;
  }, [autoRefresh, adjustedEndTime, timelineDuration, isDragging, isFirstLoad, onTimeRangeChange, totalDuration, startTime, scrollbarStartPercent, scrollbarWidthPercent, saveTimelineState]);

  useEffect(() => { rangeDurationRef.current = range.end.getTime() - range.start.getTime(); }, [range]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseleave', handleMouseLeave);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleMouseLeave]);

  const resetToDefault = useCallback(() => {
    const defaultRange = { start: new Date(adjustedEndTime.getTime() - 5 * 60 * 1000), end: adjustedEndTime };
    setRange(defaultRange);
    const maxDuration = Math.min(FORMAT_1H, totalDuration);
    const newTimelineStart = new Date(adjustedEndTime.getTime() - maxDuration);
    setTimelineStart(newTimelineStart);
    setTimelineDuration(maxDuration);
    onTimeRangeChange(defaultRange);
    saveTimelineState();
  }, [adjustedEndTime, onTimeRangeChange, totalDuration, saveTimelineState]);

  const handlePreciseTimeConfirm = useCallback((start: Date, end: Date) => {
    setRange({ start, end });
    const duration = end.getTime() - start.getTime();
    const padding = Math.max(duration * 0.5, 5 * 60 * 1000);
    const newTimelineStart = new Date(Math.max(startTime.getTime(), start.getTime() - padding));
    const newTimelineEnd = new Date(Math.min(adjustedEndTime.getTime(), end.getTime() + padding));
    const newTimelineDuration = newTimelineEnd.getTime() - newTimelineStart.getTime();
    setTimelineStart(newTimelineStart);
    setTimelineDuration(newTimelineDuration);
    onTimeRangeChange({ start, end });
    saveTimelineState();
    if (onTimeRangeChangeEnd) onTimeRangeChangeEnd();
  }, [startTime, adjustedEndTime, onTimeRangeChange, onTimeRangeChangeEnd, saveTimelineState]);

  const generateTicks = useCallback(() => {
    const ticks = [];
    const validStartTime = timelineStart instanceof Date && !isNaN(timelineStart.getTime()) ? timelineStart : new Date();
    const validEndTime = timelineEnd instanceof Date && !isNaN(timelineEnd.getTime()) ? timelineEnd : new Date();
    const validDuration = validEndTime.getTime() - validStartTime.getTime();
    let tickCount: number;
    if (validDuration <= 60 * 1000) tickCount = 6;
    else if (validDuration <= 5 * 60 * 1000) tickCount = 6;
    else if (validDuration <= 30 * 60 * 1000) tickCount = 8;
    else if (validDuration <= 2 * 60 * 60 * 1000) tickCount = 10;
    else if (validDuration <= 6 * 60 * 60 * 1000) tickCount = 12;
    else if (validDuration <= 12 * 60 * 60 * 1000) tickCount = 8;
    else tickCount = 12;
    const timeInterval = validDuration / (tickCount + 1);
    const startTimeMs = validStartTime.getTime();
    for (let i = 0; i <= tickCount + 1; i++) {
      const tickTime = new Date(startTimeMs + i * timeInterval);
      if (tickTime > validEndTime) break;
      const percent = ((tickTime.getTime() - startTimeMs) / validDuration) * 100;
      if (percent < 0 || percent > 100) continue;
      ticks.push(
        <motion.div key={i} className="absolute" style={{ left: `${percent}%` }} initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <div className={`w-px h-3 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
          <div className={`mt-1 text-[10px] whitespace-nowrap transform -translate-x-1/2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {formatTime(tickTime)}
          </div>
        </motion.div>
      );
    }
    return ticks;
  }, [timelineStart, timelineEnd, isDarkMode]);

  const ticks = useMemo(() => generateTicks(), [generateTicks]);

  const generateFileMarkers = useCallback(() => {
    if (fileTimeRanges.length === 0 || timelineDuration <= 0) return [];
    const timelineStartMs = timelineStart.getTime();
    return fileTimeRanges.map((file, index) => {
      const fileTimeMs = file.startTime.getTime();
      if (fileTimeMs < timelineStartMs || fileTimeMs > timelineEnd.getTime()) return null;
      const x = ((fileTimeMs - timelineStartMs) / timelineDuration) * 100;
      const clampedX = Math.max(0, Math.min(100, x));
      return (
        <g key={`file-${index}`}>
          <line x1={clampedX} y1={0} x2={clampedX} y2={100} stroke="#3b82f6" strokeWidth={0.3} opacity={0.4} />
        </g>
      );
    }).filter(Boolean);
  }, [fileTimeRanges, timelineStart, timelineEnd, timelineDuration]);

  const fileMarkers = useMemo(() => generateFileMarkers(), [generateFileMarkers]);

  const isDefaultRange = useMemo(() => {
    const defaultStart = new Date(adjustedEndTime.getTime() - 5 * 60 * 1000);
    const defaultEnd = adjustedEndTime;
    return range.start.getTime() === defaultStart.getTime() && range.end.getTime() === defaultEnd.getTime();
  }, [range, adjustedEndTime]);

  const canScrollLeft = timelineStart.getTime() > startTime.getTime() + 1000;
  const canScrollRight = timelineEnd.getTime() < adjustedEndTime.getTime() - 1000;
  const canZoomIn = timelineDuration > 5 * 60 * 1000;
  const canZoomOut = timelineDuration < totalDuration - 1000;

  const filesInRange = useMemo(() => {
    if (fileTimeRanges.length === 0) return 0;
    return fileTimeRanges.filter(file => file.startTime.getTime() >= range.start.getTime() && file.startTime.getTime() <= range.end.getTime()).length;
  }, [fileTimeRanges, range]);

  const fileDensity = useMemo(() => {
    if (timelineDuration === 0 || fileTimeRanges.length === 0) return 0;
    return (fileTimeRanges.length / (timelineDuration / 1000 / 60)).toFixed(1);
  }, [fileTimeRanges, timelineDuration]);

  const avgTimeGap = useMemo(() => {
    if (fileTimeRanges.length < 2) return 0;
    const gaps: number[] = [];
    for (let i = 1; i < fileTimeRanges.length; i++) gaps.push(fileTimeRanges[i].startTime.getTime() - fileTimeRanges[i - 1].startTime.getTime());
    return gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  }, [fileTimeRanges]);

  const filesInRangeList = useMemo(() => {
    if (fileTimeRanges.length === 0) return [];
    return fileTimeRanges.filter(file => file.startTime.getTime() >= range.start.getTime() && file.startTime.getTime() <= range.end.getTime());
  }, [fileTimeRanges, range]);

  if (isLoadingMetadata) {
    return (
      <div className={`w-full rounded-2xl p-5 mb-6 backdrop-blur-2xl border transition-all duration-300 ${
        isDarkMode ? 'bg-gray-800/40 border-gray-700/50' : 'bg-white/60 border-gray-200/50'
      }`}>
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <span className={`ml-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>加载时间轴...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full rounded-2xl p-5 mb-6 backdrop-blur-2xl border transition-all duration-300 overflow-visible ${
      isDarkMode 
        ? 'bg-gray-800/40 border-gray-700/50 shadow-xl shadow-black/20' 
        : 'bg-white/60 border-gray-200/50 shadow-xl shadow-gray-200/50'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <span className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>观测时间轴</span>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="flex items-center gap-1">
            <motion.button onClick={moveLeft} disabled={!canScrollLeft} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className={`p-2 rounded-xl transition-all duration-200 ${
                canScrollLeft 
                  ? isDarkMode ? 'bg-gray-700/50 text-blue-400 hover:bg-blue-500/20' : 'bg-gray-100 text-blue-500 hover:bg-blue-50'
                  : 'opacity-40 cursor-not-allowed'
              }`}>
              <ChevronLeft className="w-4 h-4" />
            </motion.button>

            <div className="flex items-center gap-0.5">
              <motion.button onClick={decreaseTimelineRange} disabled={!canZoomIn} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  canZoomIn 
                    ? isDarkMode ? 'bg-gray-700/50 text-blue-400 hover:bg-blue-500/20' : 'bg-gray-100 text-blue-500 hover:bg-blue-50'
                    : 'opacity-40 cursor-not-allowed'
                }`}>
                <ZoomIn className="w-4 h-4" />
              </motion.button>
              <motion.button onClick={increaseTimelineRange} disabled={!canZoomOut} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  canZoomOut 
                    ? isDarkMode ? 'bg-gray-700/50 text-blue-400 hover:bg-blue-500/20' : 'bg-gray-100 text-blue-500 hover:bg-blue-50'
                    : 'opacity-40 cursor-not-allowed'
                }`}>
                <ZoomOut className="w-4 h-4" />
              </motion.button>
            </div>

            <motion.button onClick={moveRight} disabled={!canScrollRight} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              className={`p-2 rounded-xl transition-all duration-200 ${
                canScrollRight 
                  ? isDarkMode ? 'bg-gray-700/50 text-blue-400 hover:bg-blue-500/20' : 'bg-gray-100 text-blue-500 hover:bg-blue-50'
                  : 'opacity-40 cursor-not-allowed'
              }`}>
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>

          <div className={`flex-1 text-center text-sm truncate px-4 py-2 rounded-xl backdrop-blur-sm border ${
            isDarkMode 
              ? 'bg-gray-900/50 text-white border-gray-700/50' 
              : 'bg-white/80 text-gray-900 border-gray-200'
          }`}>
            <span className="font-medium">{formatDateTime(range.start)}</span>
            <span className={`mx-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>~</span>
            <span className="font-medium">{formatDateTime(range.end)}</span>
            <span className={`ml-2 text-xs ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>({formatDuration(rangeDuration)})</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button ref={timePickerButtonRef} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setIsTimePickerOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
              isDarkMode 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30' 
                : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
            }`}>
            <Edit3 className="w-4 h-4" />
            <span className="hidden sm:inline">精确选择</span>
          </motion.button>
          
          <TimePickerDialog isOpen={isTimePickerOpen} onClose={() => setIsTimePickerOpen(false)} onConfirm={handlePreciseTimeConfirm}
            initialStart={range.start} initialEnd={range.end} minTime={startTime} maxTime={adjustedEndTime} anchorRef={timePickerButtonRef} />

          <motion.button onClick={resetToDefault} disabled={isDefaultRange} whileHover={{ scale: isDefaultRange ? 1 : 1.02 }} whileTap={{ scale: isDefaultRange ? 1 : 0.98 }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
              isDefaultRange 
                ? isDarkMode ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40'
            }`}>
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">恢复默认</span>
          </motion.button>

          <motion.button onClick={toggleExpand} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
              isDarkMode 
                ? 'bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-700' 
                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
            }`}>
            <span className="hidden sm:inline">{isExpanded ? '收起' : '展开'}</span>
            <ChevronLeft className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : 'rotate-270'}`} />
          </motion.button>
        </div>
      </div>

      <div className="relative">
        <motion.div ref={containerRef}
          className={`relative w-full rounded-xl overflow-hidden select-none transition-all duration-300 ${
            isDarkMode ? 'bg-gray-900/50 border border-gray-700/50' : 'bg-gray-50 border border-gray-200'
          }`}
          style={{ padding: '0 16px' }}
          initial={{ height: 50 }}
          animate={{ height: isExpanded ? 120 : 50 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}>
          <div className="absolute inset-0 flex items-center">
            <div className="relative w-full h-full">
              {isExpanded && (
                <div className="absolute inset-0 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-0 opacity-10">
                  {Array.from({ length: Math.max(5, ticks.length - 2) }).map((_, i) => (
                    <div key={i} className={`border-r ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`} />
                  ))}
                </div>
              )}
              <div className="absolute top-0 bottom-0 left-2 right-2 overflow-hidden">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">{fileMarkers}</svg>
              </div>
              <AnimatePresence mode="wait">
                {isExpanded && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    {ticks}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute top-0 bottom-0 cursor-pointer"
                style={{ left: `${Math.max(0, Math.min(100 - rangeWidth, startPercent))}%`, right: `${Math.max(0, Math.min(100, 100 - endPercent))}%` }}>
                <motion.div
                  className="absolute inset-0 top-1 bottom-1 rounded-xl border backdrop-blur-sm"
                  onMouseDown={(e) => handleMouseDown('range', e)}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)',
                    borderColor: 'rgba(99, 102, 241, 0.4)',
                    boxShadow: '0 4px 15px rgba(99, 102, 241, 0.2)'
                  }}
                  animate={{ opacity: isDragging === 'range' ? 0.9 : 0.7 }}>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                    <span className={`text-xs px-3 py-1 rounded-full backdrop-blur-sm ${
                      isDarkMode ? 'bg-gray-800/90 text-white' : 'bg-white/90 text-gray-700'
                    }`}>拖拽调整范围</span>
                  </div>
                </motion.div>

                <div className="absolute left-0 top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center"
                  onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('start', e); }}
                  onMouseEnter={() => setIsLeftHandleHovered(true)} onMouseLeave={() => setIsLeftHandleHovered(false)}>
                  <motion.div className="w-1.5 rounded-full shadow-lg"
                    initial={{ scale: 1 }}
                    animate={{
                      scale: isLeftHandleHovered || isDragging === 'start' ? 1.1 : 0.95,
                      height: isExpanded ? 36 : 20,
                      backgroundColor: isDragging === 'start' ? '#3b82f6' : isDarkMode ? '#fff' : '#fff'
                    }} />
                </div>

                <div className="absolute right-0 top-0 bottom-0 w-6 -mr-3 cursor-ew-resize flex items-center justify-center"
                  onMouseDown={(e) => { e.stopPropagation(); handleMouseDown('end', e); }}
                  onMouseEnter={() => setIsRightHandleHovered(true)} onMouseLeave={() => setIsRightHandleHovered(false)}>
                  <motion.div className="w-1.5 rounded-full shadow-lg"
                    initial={{ scale: 1 }}
                    animate={{
                      scale: isRightHandleHovered || isDragging === 'end' ? 1.1 : 0.95,
                      height: isExpanded ? 36 : 20,
                      backgroundColor: isDragging === 'end' ? '#3b82f6' : isDarkMode ? '#fff' : '#fff'
                    }} />
                </div>
              </div>

              {isExpanded && (
                <motion.div
                  className={`absolute bottom-1 left-3 text-xs px-2 py-0.5 rounded-full backdrop-blur-sm ${
                    isDarkMode ? 'bg-gray-800/90 text-gray-400' : 'bg-white/90 text-gray-500'
                  }`}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  <span className="font-medium">时间轴: {formatCompactDuration(timelineDuration)}</span>
                  <span className="ml-2">选择: {(rangeDuration / timelineDuration * 100).toFixed(1)}%</span>
                  <span className="ml-2">文件: {filesInRange}</span>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div ref={scrollbarRef} className="relative h-3 mt-2 cursor-pointer"
          onMouseEnter={() => setIsScrollbarHovered(true)} onMouseLeave={() => setIsScrollbarHovered(false)}
          onMouseDown={(e) => handleMouseDown('scrollbar', e)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <div className={`absolute inset-0 rounded-full ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-200/50'}`} />
          <motion.div className="absolute cursor-grab active:cursor-grabbing rounded-full"
            style={{ left: `${scrollbarStartPercent}%`, width: `${scrollbarWidthPercent}%` }}
            animate={{
              backgroundColor: '#3b82f6',
              height: '50%',
              top: '25%',
              opacity: isScrollbarHovered || isScrollbarDragging ? 1 : 0.6
            }} transition={{ duration: 0.15 }} />
        </motion.div>
      </div>

      {isExpanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }} className={`mt-4 p-4 rounded-xl backdrop-blur-sm border ${
            isDarkMode ? 'bg-gray-900/50 border-gray-700/50' : 'bg-white/50 border-gray-200'
          }`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className={`p-3 rounded-xl border transition-all duration-200 ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700/50 hover:border-blue-500/30' : 'bg-white/50 border-gray-200 hover:border-blue-300'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>时间轴范围</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                  {formatCompactDuration(timelineDuration)}
                </span>
              </div>
              <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatDateTime(timelineStart)}</div>
              <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatDateTime(timelineEnd)}</div>
            </div>

            <div className={`p-3 rounded-xl border transition-all duration-200 ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700/50 hover:border-purple-500/30' : 'bg-white/50 border-gray-200 hover:border-purple-300'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>当前选择范围</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-medium">
                  {(rangeDuration / timelineDuration * 100).toFixed(1)}%
                </span>
              </div>
              <div className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatDuration(rangeDuration)}</div>
              <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatDateTime(range.start)}</div>
              <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatDateTime(range.end)}</div>
            </div>

            <div className={`p-3 rounded-xl border transition-all duration-200 ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700/50 hover:border-cyan-500/30' : 'bg-white/50 border-gray-200 hover:border-cyan-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 text-cyan-400 text-xs font-bold">F</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>话单文件统计</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>总文件数</span>
                  <span className={`text-lg font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{fileTimeRanges.length}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>范围内文件</span>
                  <span className="text-lg font-medium text-blue-400">{filesInRange}</span>
                </div>
              </div>
              <div className={`flex items-center justify-between mt-2 pt-2 border-t ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200'}`}>
                <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>文件密度</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{fileDensity} 文件/分钟</span>
              </div>
            </div>

            <div className={`p-3 rounded-xl border transition-all duration-200 ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700/50 hover:border-green-500/30' : 'bg-white/50 border-gray-200 hover:border-green-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-green-600/20 text-green-400 text-xs font-bold">T</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>时间间隔分析</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>平均间隔</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{avgTimeGap > 0 ? formatCompactDuration(avgTimeGap) : 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>最早文件</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{fileTimeRanges.length > 0 ? formatTime(fileTimeRanges[0].startTime) : 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>最新文件</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{fileTimeRanges.length > 0 ? formatTime(fileTimeRanges[fileTimeRanges.length - 1].startTime) : 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className={`p-3 rounded-xl border transition-all duration-200 ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700/50 hover:border-orange-500/30' : 'bg-white/50 border-gray-200 hover:border-orange-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/20 text-orange-400 text-xs font-bold">S</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>选择起始时间</span>
              </div>
              <div className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatDateTime(range.start)}</div>
              <div className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>距离开始: {formatCompactDuration(range.start.getTime() - timelineStart.getTime())}</div>
            </div>

            <div className={`p-3 rounded-xl border transition-all duration-200 ${
              isDarkMode ? 'bg-gray-800/50 border-gray-700/50 hover:border-red-500/30' : 'bg-white/50 border-gray-200 hover:border-red-300'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gradient-to-br from-red-500/20 to-red-600/20 text-red-400 text-xs font-bold">E</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>选择结束时间</span>
              </div>
              <div className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatDateTime(range.end)}</div>
              <div className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>距离结束: {formatCompactDuration(timelineEnd.getTime() - range.end.getTime())}</div>
            </div>
          </div>

          {fileTimeRanges.length > 0 && (
            <div className={`mt-3 p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800/30 border-gray-700/50' : 'bg-white/30 border-gray-200'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 text-xs font-bold">D</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>文件分布概览</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-100'}`}>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>覆盖时长</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatDuration(totalDuration)}</span>
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-100'}`}>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>文件总数</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{fileTimeRanges.length}</span>
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-100'}`}>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>当前范围内</span>
                  <span className="text-xs font-medium text-blue-400">{filesInRange} 个文件</span>
                </div>
                <div className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-100'}`}>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>范围占比</span>
                  <span className="text-xs font-medium text-purple-400">{(rangeDuration / totalDuration * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {filesInRangeList.length > 0 && (
            <div className={`mt-3 p-3 rounded-xl border ${isDarkMode ? 'bg-gray-800/30 border-gray-700/50' : 'bg-white/30 border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400 text-xs font-bold">L</span>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>当前范围内文件列表</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                  {filesInRangeList.length} 个文件
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-2">
                {filesInRangeList.map((file, index) => (
                  <div key={index} className={`flex items-center justify-between p-3 rounded-lg transition-all border ${
                    isDarkMode 
                      ? 'bg-gray-700/30 hover:bg-gray-700/50 border-gray-700/50 hover:border-blue-500/30' 
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-blue-300'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium truncate ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{file.filename}</span>
                      </div>
                      <div className={`flex items-center gap-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(file.startTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 flex items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-[8px] font-bold">S</span>
                          {formatFileSize(file.size)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 flex items-center justify-center rounded-full bg-purple-500/20 text-purple-400 text-[8px] font-bold">#</span>
                          {formatNumber(file.lineCount)} 条
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <div className="text-right">
                        <div className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{formatFileSize(file.size)}</div>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatNumber(file.lineCount)} 条</div>
                      </div>
                      <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full opacity-60"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
