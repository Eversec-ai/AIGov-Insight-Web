'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ParsedLogEntry, LogStats } from '@/types/log';
import { StatCard } from '@/components/StatCard';
import { LogEntryCard } from '@/components/LogEntryCard';
import { RequestsChart } from '@/components/RequestsChart';
import { TabSwitcher } from '@/components/TabSwitcher';
import { TimelineView } from '@/components/TimelineView';
import { GlobalTimelineView } from '@/components/GlobalTimelineView';
import { TreeView } from '@/components/TreeView';
import { ProcessTreeView } from '@/components/ProcessTreeView';
import { SessionTimelineView } from '@/components/SessionTimelineView';

import { TimeRangeSlider } from '@/components/TimeRangeSlider';
import { GlobalLoadingOverlay } from '@/components/GlobalLoadingOverlay';
import { SecurityShield } from '@/components/SecurityShield';
import { FloatingTab } from '@/components/FloatingTab';
import { Activity, Clock, Server, Zap, RefreshCw, Sun, Moon, LogOut, Droplets, Expand, Shrink } from 'lucide-react';
import { useTransparency } from '@/context/TransparencyContext';
import { useTheme } from '@/context/ThemeContext';
import { motion } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { getDataTypeColor } from '@/lib/logParser';

export default function Dashboard() {
  const [logs, setLogs] = useState<ParsedLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<ParsedLogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTimeRangeChanging, setIsTimeRangeChanging] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isWideScreen, setIsWideScreen] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme();
  const { isTransparent, toggleTransparency } = useTransparency();

  const toggleWideScreen = useCallback(() => {
    setIsWideScreen(prev => !prev);
  }, []);
  

  
  // Tab切换状态
  const [activeTab, setActiveTab] = useState('logs'); // logs, timeline, tree
  
  // 日志时间范围状态 - 首次加载使用默认值，后续使用持久化的值
  const [logTimeRange, setLogTimeRange] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai-sec-log-time-range');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            start: new Date(parsed.start),
            end: new Date(parsed.end)
          };
        } catch (e) {
          console.error('Failed to parse saved time range:', e);
        }
      }
    }
    return {
      start: new Date(Date.now() - 5 * 60 * 1000),
      end: new Date()
    };
  });
  
  // 跟踪是否为首次加载
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  
  // 所有日志的时间范围
  const [allLogsTimeRange, setAllLogsTimeRange] = useState({
    start: new Date(),
    end: new Date()
  });
  
  // 过滤条件状态
  const [filterConditions, setFilterConditions] = useState({
    types: { // 多选日志类型过滤，默认全部勾选
      'HTTP': true,
      'LLM': true,
      'AGENT': true,
      'RAG': true,
      'MCP': true,
      'AG-UI': true,
      'FILE': true,
      'EXEC': true,
      'TOOLCALL': true,
      'OPENCLAW': true,
      'UNKNOWN': true
    },
    keyword: '', // 搜索关键字
    fullTextSearch: false // 是否开启全文搜索
  });
  
  // 时间轴相关状态
  const [timelineTimeRange, setTimelineTimeRange] = useState({ start: 0, end: 0 });
  const [timelineEventFilters, setTimelineEventFilters] = useState<{
    'AG-UI': boolean;
    'LLM': boolean;
    'HTTP': boolean;
    'MCP': boolean;
    'FILE': boolean;
    'EXEC': boolean;
    'OPENCLAW': boolean;
    'UNKNOWN': boolean;
    'OTHER': boolean;
    [key: string]: boolean; // 添加索引签名
  }>({
    'AG-UI': true,
    'LLM': true,
    'HTTP': true,
    'MCP': true,
    'FILE': true,
    'EXEC': true,
      'TOOLCALL': true,
    'OPENCLAW': true,
    'UNKNOWN': true,
    'OTHER': true
  });
  
  // 树状视图相关状态
  const [treeFilterConditions, setTreeFilterConditions] = useState({
    // 多选日志类型过滤，默认全部勾选
    types: {
      'HTTP': true,
      'LLM': true,
      'AGENT': true,
      'RAG': true,
      'MCP': true,
      'AG-UI': true,
      'FILE': true,
      'EXEC': true,
      'TOOLCALL': true,
      'OPENCLAW': true,
      'UNKNOWN': true
    },
    // 多选风险等级过滤，默认全部勾选
    riskLevels: {
      'HIGH': true,
      'MEDIUM': true,
      'LOW': true,
      'INFO': true
    },
    // 搜索关键词
    searchKeyword: ''
  });
  
  // 进程树视图相关状态
  const [processTreeFilterConditions, setProcessTreeFilterConditions] = useState({
    // 搜索关键词
    searchKeyword: '',
    // 多选进程类型过滤，默认全部勾选
    processTypes: {
      '系统服务': true,
      '运行脚本': true,
      'LLM服务': true,
      'Agent服务': true,
      'Web服务': true,
      '数据库服务': true,
      '容器服务': true,
      '用户进程': true,
      '其他进程': true
    },
    // 多选日志类型过滤，默认全部勾选
    logTypes: {
      'HTTP': true,
      'LLM': true,
      'AGENT': true,
      'RAG': true,
      'MCP': true,
      'AG-UI': true,
      'FILE': true,
      'EXEC': true,
      'TOOLCALL': true,
      'OPENCLAW': true,
      'UNKNOWN': true
    }
  });
  
  // 滚动状态 - 只需要跟踪是否滚动即可
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDockExpanded, setIsDockExpanded] = useState(false); // 控制dock栏展开/收起
  // 目标会话ID，用于从日志卡片跳转到时间轴视图时自动选择会话
  const [targetSessionId, setTargetSessionId] = useState<string | null>(null);
  // 汇总卡片显示开关
  const [showSummaryCards, setShowSummaryCards] = useState(true); // 默认显示汇总卡片
  
  // 无限滚动相关状态
  const [displayedLogsCount, setDisplayedLogsCount] = useState(20); // 初始显示20条
  const [loadingMore, setLoadingMore] = useState(false); // 加载更多状态
  const loadMoreRef = useRef<HTMLDivElement>(null); // 用于监听滚动到底部的ref
  const itemsPerPage = 20; // 每次加载20条
  
  // 时间轴回调函数
  const handleTimelineZoomIn = useCallback(() => {
    // 放大逻辑：缩小时间范围，保持中心不变
    if (timelineTimeRange.start > 0 && timelineTimeRange.end > 0) {
      const currentDuration = timelineTimeRange.end - timelineTimeRange.start;
      const newDuration = currentDuration / 1.25; // 每次放大25%
      const centerTime = timelineTimeRange.start + currentDuration / 2;
      const newRange = {
        start: centerTime - newDuration / 2,
        end: centerTime + newDuration / 2
      };
      setTimelineTimeRange(newRange);
    }
  }, [timelineTimeRange]);
  
  const handleTimelineZoomOut = useCallback(() => {
    // 缩小逻辑：扩大时间范围，保持中心不变
    if (timelineTimeRange.start > 0 && timelineTimeRange.end > 0) {
      const currentDuration = timelineTimeRange.end - timelineTimeRange.start;
      const newDuration = currentDuration * 1.25; // 每次缩小25%
      const centerTime = timelineTimeRange.start + currentDuration / 2;
      const newRange = {
        start: centerTime - newDuration / 2,
        end: centerTime + newDuration / 2
      };
      setTimelineTimeRange(newRange);
    }
  }, [timelineTimeRange]);
  
  const handleTimelineReset = useCallback(() => {
    setTimelineEventFilters({
      'AG-UI': true,
      'LLM': true,
      'HTTP': true,
      'MCP': true,
      'FILE': true,
      'EXEC': true,
      'TOOLCALL': true,
      'OPENCLAW': true,
      'UNKNOWN': true,
      'OTHER': true
    });
    setTimelineTimeRange({ start: 0, end: 0 });
  }, []);
  
  const handleTimelineFilterChange = useCallback((type: string) => {
    // 过滤逻辑
    setTimelineEventFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  }, []);

  // 处理从日志卡片跳转到时间轴视图
  const handleTimelineClick = useCallback((logId: string) => {
    setTargetSessionId(logId);
    setActiveTab('timeline');
  }, []);
  
  // 处理从日志卡片跳转到树状视图
  const handleTreeClick = useCallback((logId: string) => {
    setTargetSessionId(logId);
    setActiveTab('tree');
  }, []);

  // 处理从日志卡片跳转到会话级时序图
  const handleSessionTimelineClick = useCallback((logId: string) => {
    setTargetSessionId(logId);
    setActiveTab('sessionTimeline');
  }, []);
  
  // 处理从时间轴跳转到日志详情
  const handleViewLog = useCallback((logId: string) => {
    setActiveTab('logs');
    // 设置搜索词为点击的日志ID，实现精确查找
    setFilterConditions(prev => ({
      ...prev,
      keyword: logId
    }));
  }, []);
  
  // 处理从 TreeView 话单类型统计标签点击事件
  const handleTreeTypeFilterClick = useCallback((type: string) => {
    if (type === '全部') {
      setTreeFilterConditions(prev => ({
        ...prev,
        types: {
          HTTP: true,
          LLM: true,
          AGENT: true,
          RAG: true,
          MCP: true,
          'AG-UI': true,
          FILE: true,
          EXEC: true,
          TOOLCALL: true,
          OPENCLAW: true,
          UNKNOWN: true
        },
        riskLevels: {
          HIGH: true,
          MEDIUM: true,
          LOW: true,
          INFO: true
        }
      }));
    } else if (type === 'HIGH' || type === 'MEDIUM' || type === 'LOW' || type === 'INFO') {
      setTreeFilterConditions(prev => ({
        ...prev,
        types: {
          HTTP: false,
          LLM: false,
          AGENT: false,
          RAG: false,
          MCP: false,
          'AG-UI': false,
          FILE: true,
          EXEC: true,
          TOOLCALL: true,
          OPENCLAW: false,
          UNKNOWN: false
        },
        riskLevels: {
          HIGH: type === 'HIGH',
          MEDIUM: type === 'MEDIUM',
          LOW: type === 'LOW',
          INFO: type === 'INFO'
        }
      }));
    } else {
      setTreeFilterConditions(prev => ({
        ...prev,
        types: {
          HTTP: type === 'HTTP',
          LLM: type === 'LLM',
          AGENT: type === 'AGENT',
          RAG: type === 'RAG',
          MCP: type === 'MCP',
          'AG-UI': type === 'AG-UI',
          FILE: type === 'FILE',
          EXEC: type === 'EXEC',
          TOOLCALL: type === 'TOOLCALL',
          OPENCLAW: type === 'OPENCLAW',
          UNKNOWN: type === 'UNKNOWN'
        },
        riskLevels: {
          HIGH: true,
          MEDIUM: true,
          LOW: true,
          INFO: true
        }
      }));
    }
  }, []);
  
  const handleTimelineTimeRangeChange = useCallback((range: { start: number; end: number }) => {
    setTimelineTimeRange(range);
  }, []);

  const handleTimeRangeChangeEnd = useCallback(() => {
    setIsTimeRangeChanging(true);
  }, []);
  
  // 移除不再需要的ref引用，只保留必要的日志区域ref
  const logsRef = useRef<HTMLDivElement>(null); // 日志区域的ref

  // 日志过滤函数
  const filterLogs = useCallback(() => {
    let result = [...logs];
    
    // 类型过滤 - 只保留被勾选的类型
    const selectedTypes = Object.keys(filterConditions.types).filter(type => {
      // 使用类型断言解决TypeScript索引签名问题
      const typesObj = filterConditions.types as Record<string, boolean>;
      return typesObj[type];
    });
    if (selectedTypes.length > 0) {
      result = result.filter(log => selectedTypes.includes(log.dataType));
    }
    
    // 关键字搜索
    if (filterConditions.keyword) {
      const keyword = filterConditions.keyword.toLowerCase();
      result = result.filter(log => {
        if (filterConditions.fullTextSearch) {
          // 全文搜索 - 覆盖更多字段，优先使用解码后的字段
          return (
            // 使用解码后的字段进行搜索
            log.parsedQuery?.toLowerCase().includes(keyword) ||
            log.parsedAnswer?.toLowerCase().includes(keyword) ||
            log.parsedReqPayload?.toLowerCase().includes(keyword) ||
            log.parsedRspPayload?.toLowerCase().includes(keyword) ||
            log.thought?.toLowerCase().includes(keyword) ||
            log.agentName?.toLowerCase().includes(keyword) ||
            log.ModelName?.toLowerCase().includes(keyword) ||
            log.logID?.toLowerCase().includes(keyword) ||
            log.dataType?.toLowerCase().includes(keyword) ||
            log.reqIp?.toLowerCase().includes(keyword) ||
            log.reqPort?.toLowerCase().includes(keyword) ||
            log.respIp?.toLowerCase().includes(keyword) ||
            log.respPort?.toLowerCase().includes(keyword) ||
            log.agentID?.toLowerCase().includes(keyword) ||
            log.toolName?.toLowerCase().includes(keyword) ||
            log.llmProvider?.toLowerCase().includes(keyword) ||
            // 也搜索原始字段，确保兼容性
            log.query?.toLowerCase().includes(keyword) ||
            log.answer?.toLowerCase().includes(keyword) ||
            log.reqPayload?.toLowerCase().includes(keyword) ||
            log.rspPayload?.toLowerCase().includes(keyword)
          );
        } else {
          // 默认关键字搜索 - 只搜索几个关键字段，优先使用解码后的字段
          return (
            // 使用解码后的字段进行搜索
            log.parsedQuery?.toLowerCase().includes(keyword) ||
            log.logID?.toLowerCase().includes(keyword) ||
            log.reqIp?.toLowerCase().includes(keyword) ||
            log.reqPort?.toLowerCase().includes(keyword) ||
            log.respIp?.toLowerCase().includes(keyword) ||
            log.respPort?.toLowerCase().includes(keyword) ||
            log.ModelName?.toLowerCase().includes(keyword) ||
            log.dataType?.toLowerCase().includes(keyword) ||
            // 也搜索原始字段，确保兼容性
            log.query?.toLowerCase().includes(keyword)
          );
        }
      });
    }
    
    setFilteredLogs(result);
  }, [logs, filterConditions]);

  // 使用useCallback包裹，避免每次渲染重新创建函数
  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');
      params.append('startTime', logTimeRange.start.toISOString());
      params.append('endTime', logTimeRange.end.toISOString());

      const currentLogsResponse = await fetch(`/api/logs?${params.toString()}`);
      const currentLogsData = await currentLogsResponse.json();
      const currentLogs = currentLogsData.logs || [];

      setLogs(currentLogs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  }, [logTimeRange]);

  const fetchMetadata = useCallback(async () => {
    try {
      const response = await fetch('/api/logs/metadata');
      const data = await response.json();
      
      if (data.startTime && data.endTime) {
        setAllLogsTimeRange({ 
          start: new Date(data.startTime), 
          end: new Date(data.endTime) 
        });
      }
    } catch (error) {
      console.error('Failed to fetch logs metadata:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      // 构建URL参数
      const params = new URLSearchParams();
      params.append('startTime', logTimeRange.start.toISOString());
      params.append('endTime', logTimeRange.end.toISOString());
      
      const response = await fetch(`/api/stats?${params.toString()}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [logTimeRange]);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([fetchMetadata(), fetchLogs(), fetchStats()]);
    setIsRefreshing(false);
    setIsLoading(false);
    setIsTimeRangeChanging(false);
  }, [fetchMetadata, fetchLogs, fetchStats]);

  // 当日志或过滤条件变化时，重新过滤
  useEffect(() => {
    const timer = setTimeout(() => {
      filterLogs();
    }, 0);
    return () => clearTimeout(timer);
  }, [filterLogs, logs]);

  // 监听tab切换，自动控制自动刷新
  useEffect(() => {
    if (activeTab === 'logs') {
      // 只有实时日志视图需要自动刷新，切换到日志视图时保持自动刷新状态
      return;
    }
    // 切换到时间轴或树状视图时，自动关闭自动刷新
    const timer = setTimeout(() => {
      setAutoRefresh(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // 持久化日志时间范围到 localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !isFirstLoad) {
      try {
        localStorage.setItem('ai-sec-log-time-range', JSON.stringify({
          start: logTimeRange.start.toISOString(),
          end: logTimeRange.end.toISOString()
        }));
      } catch (e) {
        console.error('Failed to save time range to localStorage:', e);
      }
    }
  }, [logTimeRange, isFirstLoad]);

  // 首次加载完成后设置标志
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFirstLoad(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      await fetchData();
    };
    fetchInitialData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, fetchData]);

  useEffect(() => {
    let animationFrameId: number;
    
    const handleScroll = () => {
      // 取消之前的动画帧
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      
      // 使用requestAnimationFrame确保在每一帧只更新一次，无延迟
      animationFrameId = requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        // 当滚动超过最顶部时，立即开始缩小
        setIsScrolled(scrollY > 0);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true }); // 添加passive优化性能
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  // 实现无限滚动的加载更多函数
  const loadMoreLogs = useCallback(() => {
    if (loadingMore || displayedLogsCount >= filteredLogs.length) {
      return;
    }
    
    setLoadingMore(true);
    // 使用setTimeout模拟异步加载，实际项目中可以替换为真实的异步请求
    setTimeout(() => {
      setDisplayedLogsCount(prev => Math.min(prev + itemsPerPage, filteredLogs.length));
      setLoadingMore(false);
    }, 500);
  }, [loadingMore, displayedLogsCount, filteredLogs.length, itemsPerPage]);

  // 使用Intersection Observer监听滚动到底部
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && displayedLogsCount < filteredLogs.length) {
          loadMoreLogs();
        }
      },
      { threshold: 0.5 } // 当元素50%可见时触发
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [loadingMore, displayedLogsCount, filteredLogs.length, loadMoreLogs]);

  // 当日志更新或过滤条件变化时，重置显示数量
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayedLogsCount(itemsPerPage);
    }, 0);
    return () => clearTimeout(timer);
  }, [filteredLogs, itemsPerPage]);

  return (
    <div className="min-h-screen bg-transparent">

      {/* 全局加载遮罩 */}
      <GlobalLoadingOverlay 
        isLoading={isTimeRangeChanging} 
        message="正在加载日志数据..." 
      />

      
      {/* 顶部导航栏 */}
      <header className={`sticky top-0 z-50 backdrop-blur-2xl border-b transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) ${isScrolled ? 'py-1' : 'py-3'} ${
        isDarkMode 
          ? 'bg-gray-900/60 border-gray-700/50' 
          : 'bg-white/70 border-gray-200/50'
      }`}>
        <div className={`${isWideScreen ? 'w-full' : 'max-w-7xl mx-auto'} px-6 transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) ${isScrolled ? 'py-1' : 'py-3'}`}>
          <div className="flex items-center justify-between">
            <div className={`flex items-center transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) ${isScrolled ? 'gap-3' : 'gap-3'}`} style={{ width: isScrolled ? 'auto' : 'auto' }}>
              <div className={`transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) ${isScrolled ? 'w-8 h-8' : 'w-10 h-10'}`}>
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className={`transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) ${isScrolled ? '-ml-0.5' : ''}`} style={{ opacity: isScrolled ? 0.8 : 1, transform: isScrolled ? 'scale(0.9)' : 'scale(1)', transformOrigin: 'left center' }}>
                <div className="flex items-center gap-2">
                  <h1 className={`transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) font-extrabold ${isScrolled ? 'text-lg' : 'text-xl'}`}>
                    <span className="relative inline-block">
                      <span className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 via-pink-500 to-blue-500 bg-[length:300%_100%] bg-clip-text text-transparent animate-gradient-flow-slow drop-shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                        AIGov-Insight
                      </span>
                      <span className="relative bg-gradient-to-r from-blue-400 via-indigo-400 via-purple-400 via-pink-400 to-cyan-400 bg-[length:300%_100%] bg-clip-text text-transparent animate-gradient-flow-slow">
                        AIGov-Insight
                      </span>
                    </span>
                    <span className={`${isDarkMode ? 'text-gray-200' : 'text-gray-700'} font-semibold ml-1`}>智能体安全治理平台</span>
                  </h1>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gradient-to-r from-[var(--accent-blue)]/20 to-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 backdrop-blur-sm transition-all duration-300 ${isScrolled ? 'scale-90' : 'scale-100'}`}>
                    v0.3.0
                  </span>
                </div>
                <p className={`transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1) text-[var(--text-secondary)] ${isScrolled ? 'text-[10px]' : 'text-xs'}`}>
                  让 AI 的每一次"思考"与"行动" 
                  <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent font-medium ml-1">全程透明、可溯、可控</span>
                </p>
              </div>
            </div>

            {/* 移除迷你统计图标 - 不再需要卡片缩小到标题栏的功能 */}

            <div className="flex items-center gap-1.5">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`group relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ease-out ${
                  autoRefresh
                    ? isDarkMode 
                      ? 'bg-[#34C759]/15 text-[#34C759] border border-[#34C759]/25'
                      : 'bg-[#34C759]/10 text-[#248A3D] border border-[#34C759]/20'
                    : isDarkMode 
                      ? 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/8 hover:border-white/15'
                      : 'bg-gray-50/80 text-gray-500 border border-gray-200/60 hover:bg-gray-100/80 hover:border-gray-300/60'
                }`}
                style={{
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                {autoRefresh ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34C759] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#34C759]"></span>
                  </span>
                ) : (
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    <span className={`inline-flex rounded-sm transition-all duration-200 ${
                      isDarkMode ? 'bg-gray-500 group-hover:bg-gray-400' : 'bg-gray-400 group-hover:bg-gray-500'
                    }`} style={{ width: '6px', height: '6px' }}></span>
                  </span>
                )}
                <span className="font-[500] tracking-tight">{autoRefresh ? '自动刷新' : '已暂停'}</span>
              </motion.button>

              <div className={`flex items-center gap-1 p-1 rounded-full transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/5 border border-white/10' 
                  : 'bg-gray-100/80 border border-gray-200/60'
              }`}
              style={{
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={fetchData}
                  disabled={isRefreshing}
                  className={`relative p-2 rounded-full transition-all duration-200 ease-out group ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-white/10 hover:text-blue-400' 
                      : 'text-gray-600 hover:bg-white hover:text-blue-500'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <RefreshCw className={`w-4 h-4 transition-transform duration-500 ${isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'}`} />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleTheme}
                  className={`relative p-2 rounded-full transition-all duration-200 ease-out group ${
                    isDarkMode 
                      ? 'text-gray-300 hover:bg-white/10 hover:text-amber-400' 
                      : 'text-gray-600 hover:bg-white hover:text-amber-500'
                  }`}
                >
                  {isDarkMode ? <Sun className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" /> : <Moon className="w-4 h-4 transition-transform duration-200 group-hover:-rotate-12" />}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleTransparency}
                  className={`relative p-2 rounded-full transition-all duration-200 ease-out group ${
                    isTransparent
                      ? isDarkMode
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-blue-500/15 text-blue-500'
                      : isDarkMode 
                        ? 'text-gray-300 hover:bg-white/10 hover:text-blue-400' 
                        : 'text-gray-600 hover:bg-white hover:text-blue-500'
                  }`}
                >
                  <Droplets className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleWideScreen}
                  className={`relative p-2 rounded-full transition-all duration-200 ease-out group ${
                    isWideScreen
                      ? isDarkMode
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-purple-500/15 text-purple-500'
                      : isDarkMode 
                        ? 'text-gray-300 hover:bg-white/10 hover:text-purple-400' 
                        : 'text-gray-600 hover:bg-white hover:text-purple-500'
                  }`}
                  title={isWideScreen ? "默认模式" : "宽屏模式"}
                >
                  {isWideScreen ? <Shrink className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" /> : <Expand className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />}
                </motion.button>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => signOut({ callbackUrl: '/' })}
                className={`relative p-2 rounded-full transition-all duration-200 ease-out group ${
                  isDarkMode 
                    ? 'text-gray-400 hover:bg-red-500/15 hover:text-red-400' 
                    : 'text-gray-500 hover:bg-red-50 hover:text-red-500'
                }`}
              >
                <LogOut className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
              </motion.button>
            </div>
          </div>
        </div>
      </header>
      
      {/* 可展开的全局工具栏 - 根据当前激活的标签页显示不同内容 */}
      {activeTab !== 'security' && (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        {/* 优化的玻璃效果容器 */}
        <div 
          className={`transition-all duration-300 ease-out overflow-hidden rounded-full shadow-lg border border-white/20 dark:border-black/20`}
          style={{
            width: isDockExpanded ? '680px' : '480px',
            height: isDockExpanded ? 'auto' : '56px',
            borderRadius: isDockExpanded ? '20px' : '9999px',
            // 苹果风格的玻璃效果，适配明暗主题
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            // 添加精致的边缘高光
            boxShadow: `
              0 8px 32px rgba(0, 0, 0, 0.15),
              0 0 0 1px rgba(255, 255, 255, 0.1) inset,
              0 1px 0 rgba(255, 255, 255, 0.2) inset
            `
          }}
        >
          {/* 实时日志页面的工具栏 */}
          {activeTab === 'logs' && (
            <>
              {/* 基础搜索栏 - 始终显示 */}
              <div className="relative p-2">
                {/* 搜索容器，确保搜索框尺寸平滑过渡 */}
                <div className="relative rounded-full overflow-hidden">
                  <input
                    type="text"
                    value={filterConditions.keyword}
                    onChange={(e) => setFilterConditions(prev => ({ ...prev, keyword: e.target.value }))}
                    placeholder="搜索日志..."
                    className="w-full pl-10 pr-32 py-2 rounded-full text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-30 transition-all duration-300"
                    style={{
                      transitionProperty: 'width, padding, border-radius',
                      transitionDuration: '0.5s',
                      transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  />
                  
                  {/* 搜索图标 */}
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)]">
                    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  
                  {/* 清除关键字按钮 */}
                  {filterConditions.keyword && (
                    <button
                      onClick={() => setFilterConditions(prev => ({ ...prev, keyword: '' }))}
                      className="absolute right-30 top-1/2 transform -translate-y-1/2 p-1 rounded-full text-[var(--text-secondary)] hover:bg-white/20 dark:hover:bg-black/30 hover:text-[var(--foreground)] transition-all duration-200 ease-in-out"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  
                  {/* 精致的全文搜索开关 */}
                  <div className="absolute right-12 top-1/2 transform -translate-y-1/2 flex items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">全文</span>
                    <button
                      onClick={() => setFilterConditions(prev => ({ ...prev, fullTextSearch: !prev.fullTextSearch }))}
                      className={`relative inline-flex h-4 w-8 items-center rounded-full transition-all duration-300 ease-in-out ${
                        filterConditions.fullTextSearch 
                          ? 'bg-[var(--accent-blue)]' 
                          : 'bg-black/10'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                          filterConditions.fullTextSearch ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                        style={{
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                        }}
                      />
                    </button>
                  </div>
                  
                  {/* 切换展开/收起按钮 */}
                  <button
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                    onClick={() => setIsDockExpanded(!isDockExpanded)}
                    style={{
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                    }}
                  >
                    <svg 
                      className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                        isDockExpanded ? 'rotate-0' : 'rotate-180'
                      }`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* 展开时显示的高级过滤选项 */}
              {isDockExpanded && (
                <>
                  {/* 网格布局的过滤选项 */}
                  <div 
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 px-3 pb-3 pt-1"
                    style={{
                      animation: 'fadeInUp 0.3s ease-out forwards'
                    }}
                  >
                    {/* 日志类型过滤 - 多选 */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-medium text-[var(--text-secondary)]">日志类型</label>
                        <button
                          onClick={() => setFilterConditions(prev => ({
                            ...prev,
                            types: {
                              'HTTP': true,
                              'LLM': true,
                              'AGENT': true,
                              'RAG': true,
                              'MCP': true,
                              'AG-UI': true,
                              'FILE': true,
                              'EXEC': true,
      'TOOLCALL': true,
                              'OPENCLAW': true,
                              'UNKNOWN': true
                            }
                          }))}
                          className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                        >
                          全选
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(filterConditions.types).map(([type, checked]) => (
                          <div key={type} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setFilterConditions(prev => ({
                                ...prev,
                                types: {
                                  ...prev.types,
                                  [type]: e.target.checked
                                }
                              }))}
                              className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)]/30 transition-all"
                            />
                            <label className="text-xs font-medium text-[var(--foreground)] cursor-pointer">{type}</label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* 清除过滤按钮 */}
                    <div className="flex items-end">
                      {(Object.values(filterConditions.types).some(v => !v) || filterConditions.keyword || filterConditions.fullTextSearch) && (
                        <button
                          onClick={() => setFilterConditions({
                            types: {
                              'HTTP': true,
                              'LLM': true,
                              'AGENT': true,
                              'RAG': true,
                              'MCP': true,
                              'AG-UI': true,
                              'FILE': true,
                              'EXEC': true,
      'TOOLCALL': true,
                              'OPENCLAW': true,
                              'UNKNOWN': true
                            },
                            keyword: '',
                            fullTextSearch: false
                          })}
                          className="w-full px-4 py-1.5 rounded-xl bg-white/10 dark:bg-black/20 border border-black/20 dark:border-white/20 text-[var(--foreground)] text-sm hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200"
                        >
                          清除所有过滤
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* 新增行：汇总卡片开关 */}
                  <div className="px-3 pb-3 pt-1 border-t border-[var(--border-color)]/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">显示汇总卡片</span>
                      <button
                        onClick={() => setShowSummaryCards(!showSummaryCards)}
                        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-all duration-300 ease-in-out ${
                          showSummaryCards 
                            ? 'bg-[var(--accent-blue)]' 
                            : 'bg-black/10'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                            showSummaryCards ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                          style={{
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                          }}
                        />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          
          {/* 进程树视图页面的工具栏 */}
          {activeTab === 'process' && (
            <>
              {/* 进程树视图工具栏 - 始终显示 */}
              <div className="relative p-2">
                {/* 工具栏容器，保持与搜索栏相同的样式 */}
                <div className="relative rounded-full overflow-hidden">
                  {/* 进程树视图搜索框 - 与其他页面风格统一 */}
                  <div className="relative">
                    <input
                      type="text"
                      value={processTreeFilterConditions.searchKeyword}
                      onChange={(e) => setProcessTreeFilterConditions(prev => ({ ...prev, searchKeyword: e.target.value }))}
                      placeholder="搜索进程、PID、进程名..."
                      className="w-full pl-10 pr-32 py-2 rounded-full text-[var(--foreground)] focus:outline-none transition-all duration-300"
                      style={{
                        transitionProperty: 'width, padding, border-radius',
                        transitionDuration: '0.5s',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    />
                    
                    {/* 搜索图标 */}
                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)]">
                      <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    
                    {/* 清除搜索关键词按钮 */}
                    {processTreeFilterConditions.searchKeyword && (
                      <button
                        onClick={() => setProcessTreeFilterConditions(prev => ({ ...prev, searchKeyword: '' }))}
                        className="absolute right-12 top-1/2 transform -translate-y-1/2 p-1 rounded-full text-[var(--text-secondary)] hover:bg-white/20 dark:hover:bg-black/30 hover:text-[var(--foreground)] transition-all duration-200 ease-in-out"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                        
                    {/* 切换展开/收起按钮 */}
                    <button
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                      onClick={() => setIsDockExpanded(!isDockExpanded)}
                      style={{
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                      }}
                    >
                      <svg 
                        className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                          isDockExpanded ? 'rotate-0' : 'rotate-180'
                        }`} 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              
              {/* 展开时显示的进程树视图高级选项 */}
              {isDockExpanded && (
                <div 
                  className="grid grid-cols-1 gap-4 px-3 pb-3 pt-1"
                  style={{
                    animation: 'fadeInUp 0.3s ease-out forwards'
                  }}
                >
                  {/* 进程类型过滤 - 多选 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">进程类型</label>
                      <button
                        onClick={() => setProcessTreeFilterConditions(prev => ({
                          ...prev,
                          processTypes: {
                            '系统服务': true,
                            '运行脚本': true,
                            'LLM服务': true,
                            'Agent服务': true,
                            'Web服务': true,
                            '数据库服务': true,
                            '容器服务': true,
                            '用户进程': true,
                            '其他进程': true
                          }
                        }))}
                        className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                      >
                        全选
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(processTreeFilterConditions.processTypes).map(([type, checked]) => (
                        <div key={type} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setProcessTreeFilterConditions(prev => ({
                              ...prev,
                              processTypes: {
                                ...prev.processTypes,
                                [type]: e.target.checked
                              }
                            }))}
                            className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)]/30 transition-all"
                          />
                          <label className="text-xs font-medium text-[var(--foreground)] cursor-pointer">{type}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 日志类型过滤 - 多选 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">日志类型</label>
                      <button
                          onClick={() => setProcessTreeFilterConditions(prev => ({
                            ...prev,
                            logTypes: {
                              'HTTP': true,
                              'LLM': true,
                              'AGENT': true,
                              'RAG': true,
                              'MCP': true,
                              'AG-UI': true,
                              'FILE': true,
                              'EXEC': true,
      'TOOLCALL': true,
                              'OPENCLAW': true,
                              'UNKNOWN': true
                            }
                          }))}
                          className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                        >
                          全选
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(processTreeFilterConditions.logTypes).map(([type, checked]) => (
                        <div key={type} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => setProcessTreeFilterConditions(prev => ({
                              ...prev,
                              logTypes: {
                                ...prev.logTypes,
                                [type]: e.target.checked
                              }
                            }))}
                            className="h-4 w-4 rounded border-[var(--border-color)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)]/30 transition-all"
                          />
                          <label className="text-xs font-medium text-[var(--foreground)] cursor-pointer">{type}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 清除过滤按钮 */}
                  {(processTreeFilterConditions.searchKeyword || Object.values(processTreeFilterConditions.processTypes).some(v => !v) || Object.values(processTreeFilterConditions.logTypes).some(v => !v)) && (
                    <button
                      onClick={() => setProcessTreeFilterConditions({
                        searchKeyword: '',
                        processTypes: {
                          '系统服务': true,
                          '运行脚本': true,
                          'LLM服务': true,
                          'Agent服务': true,
                          'Web服务': true,
                          '数据库服务': true,
                          '容器服务': true,
                          '用户进程': true,
                          '其他进程': true
                        },
                        logTypes: {
                          'HTTP': true,
                          'LLM': true,
                          'AGENT': true,
                          'RAG': true,
                          'MCP': true,
                          'AG-UI': true,
                          'FILE': true,
                          'EXEC': true,
      'TOOLCALL': true,
                          'OPENCLAW': true,
                          'UNKNOWN': true
                        }
                      })}
                      className="w-full px-4 py-1.5 rounded-xl bg-white/10 dark:bg-black/20 border border-black/20 dark:border-white/20 text-[var(--foreground)] text-sm hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200"
                    >
                      清除所有过滤
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* 全局时间轴页面的工具栏 */}
          {activeTab === 'globalTimeline' && (
            <>
              <div className="relative p-2">
                <div className="relative rounded-full overflow-hidden">
                  <div className="w-full py-1 px-6 rounded-full text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-30 transition-all duration-300 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        title="放大"
                        onClick={() => {
                          const globalTimelineElement = document.querySelector('[data-global-timeline-zoom-in]');
                          (globalTimelineElement as HTMLButtonElement)?.click();
                        }}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        title="重置缩放"
                        onClick={() => {
                          const globalTimelineElement = document.querySelector('[data-global-timeline-reset]');
                          (globalTimelineElement as HTMLButtonElement)?.click();
                        }}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        title="缩小"
                        onClick={() => {
                          const globalTimelineElement = document.querySelector('[data-global-timeline-zoom-out]');
                          (globalTimelineElement as HTMLButtonElement)?.click();
                        }}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                        </svg>
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-[var(--foreground)] font-medium">
                      <span className="text-xs text-[var(--text-secondary)]">全局时间轴</span>
                      <span className="text-xs font-medium text-[var(--accent-blue)]">全景展示</span>
                    </div>
                    
                    <button
                      className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                      onClick={() => setIsDockExpanded(!isDockExpanded)}
                      title={isDockExpanded ? '收起' : '展开'}
                      style={{
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                      }}
                    >
                      <svg 
                        className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                          isDockExpanded ? 'rotate-0' : 'rotate-180'
                        }`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              
              {isDockExpanded && (
                <div 
                  className="grid grid-cols-1 gap-3 px-4 pb-3 pt-1"
                  style={{
                    animation: 'fadeInUp 0.3s ease-out forwards'
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">使用说明</label>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      全局时间轴视图展示所有话单的时间关系，支持拖拽平移、缩放查看、筛选事件类型。
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          
          {/* 时间轴页面的工具栏 */}
          {activeTab === 'timeline' && (
            <>
              {/* 时间轴工具栏 - 始终显示，Apple风格精致设计 */}
              <div className="relative p-2">
                {/* 容器，保持与搜索框相同的圆角和阴影 */}
                <div className="relative rounded-full overflow-hidden">
                  {/* 基础样式容器 - 居中对齐 */}
                  <div className="w-full py-1 px-6 rounded-full text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-30 transition-all duration-300 flex items-center justify-between">
                    {/* 左侧：缩放控制 - 与搜索工具栏展开按钮风格完全一致 */}
                    <div className="flex items-center gap-1.5">
                      {/* 放大按钮 - 直接使用+符号 */}
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        title="放大"
                        onClick={handleTimelineZoomIn}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      
                      {/* 重置按钮 - 搜索工具栏展开按钮风格 */}
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        title="重置缩放"
                        onClick={handleTimelineReset}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      
                      {/* 缩小按钮 - 直接使用-符号 */}
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        title="缩小"
                        onClick={handleTimelineZoomOut}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* 中间：时间范围显示 - 居中对齐，精确到毫秒 */}
                    <div className="flex items-center gap-2 text-sm text-[var(--foreground)] font-medium">
                      <span className="text-xs text-[var(--text-secondary)]">时间范围</span>
                      <span className="text-xs font-medium text-[var(--foreground)]">
                        {timelineTimeRange.start > 0 && timelineTimeRange.end > 0 ? (
                          `${new Date(timelineTimeRange.start).toLocaleTimeString('zh-CN', { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit',
                            fractionalSecondDigits: 3
                          })} - ${new Date(timelineTimeRange.end).toLocaleTimeString('zh-CN', { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit',
                            fractionalSecondDigits: 3
                          })}`
                        ) : (
                          '自动'
                        )}
                      </span>
                    </div>
                    
                    {/* 右侧：展开/收起按钮 - 与搜索工具栏展开按钮完全一致 */}
                    <button
                      className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                      onClick={() => setIsDockExpanded(!isDockExpanded)}
                      title={isDockExpanded ? '收起' : '展开'}
                      style={{
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                      }}
                    >
                      <svg 
                        className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                          isDockExpanded ? 'rotate-0' : 'rotate-180'
                        }`}
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              
              {/* 展开时显示的高级过滤选项 - Apple风格精致设计 */}
              {isDockExpanded && (
                <div 
                  className="grid grid-cols-1 gap-3 px-4 pb-3 pt-1"
                  style={{
                    animation: 'fadeInUp 0.3s ease-out forwards'
                  }}
                >
                  {/* 事件类型复选框 - 简化布局 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">事件类型</label>
                      <button
                        onClick={handleTimelineReset}
                        className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                      >
                        全选
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.keys(timelineEventFilters).map((type) => (
                        <div key={type} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`timeline-filter-${type}`}
                            checked={timelineEventFilters[type]}
                            onChange={() => handleTimelineFilterChange(type)}
                            className="w-4 h-4 rounded text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-white/15 dark:bg-black/25 border border-white/30 dark:border-black/40 transition-all duration-200"
                          />
                          <label htmlFor={`timeline-filter-${type}`} className="text-sm text-[var(--foreground)]">
                            {type}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 重置按钮 - Apple风格 */}
                  <button
                    onClick={handleTimelineReset}
                    className="w-full py-2 px-4 rounded-xl bg-white/15 dark:bg-black/25 border border-white/20 dark:border-black/30 text-[var(--foreground)] text-sm hover:bg-white/25 dark:hover:bg-black/35 transition-all duration-200 backdrop-blur-sm"
                    style={{
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                    }}
                  >
                    重置时间轴视图
                  </button>
                </div>
              )}
            </>
          )}
          
          {/* 树状视图页面的工具栏 */}
          {activeTab === 'tree' && (
            <>
              {/* 树状视图工具栏 - 始终显示 */}
              <div className="relative p-2">
                {/* 工具栏容器，保持与搜索栏相同的样式 */}
                <div className="relative rounded-full overflow-hidden">
                  {/* 树状视图控制按钮组 */}
                  <div className="w-full">
                    {/* 搜索框 - 与实时日志页面风格统一 */}
                    <div className="relative mb-2">
                      <input
                        type="text"
                        value={treeFilterConditions.searchKeyword}
                        onChange={(e) => setTreeFilterConditions(prev => ({ ...prev, searchKeyword: e.target.value }))}
                        placeholder="搜索关键字..."
                        className="w-full pl-10 pr-32 py-2 rounded-full text-[var(--foreground)] focus:outline-none transition-all duration-300"
                        style={{
                          transitionProperty: 'width, padding, border-radius',
                          transitionDuration: '0.5s',
                          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      />
                      
                      {/* 搜索图标 */}
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)]">
                        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      
                      {/* 清除搜索关键词按钮 */}
                      {treeFilterConditions.searchKeyword && (
                        <button
                          onClick={() => setTreeFilterConditions(prev => ({ ...prev, searchKeyword: '' }))}
                          className="absolute right-12 top-1/2 transform -translate-y-1/2 p-1 rounded-full text-[var(--text-secondary)] hover:bg-white/20 dark:hover:bg-black/30 hover:text-[var(--foreground)] transition-all duration-200 ease-in-out"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                        
                      {/* 切换展开/收起按钮 */}
                      <button
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        onClick={() => setIsDockExpanded(!isDockExpanded)}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg 
                          className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                            isDockExpanded ? 'rotate-0' : 'rotate-180'
                          }`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 展开时显示的树状视图高级选项 */}
              {isDockExpanded && (
                <div 
                  className="grid grid-cols-1 gap-4 px-3 pb-3 pt-1"
                  style={{
                    animation: 'fadeInUp 0.3s ease-out forwards'
                  }}
                >
                  {/* 日志类型过滤 - 多选 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">日志类型</label>
                      <button
                        onClick={() => setTreeFilterConditions(prev => ({
                          ...prev,
                          types: {
                            'HTTP': true,
                            'LLM': true,
                            'AGENT': true,
                            'RAG': true,
                            'MCP': true,
                            'AG-UI': true,
                            'FILE': true,
                            'EXEC': true,
      'TOOLCALL': true,
                            'OPENCLAW': true,
                            'UNKNOWN': true
                          }
                        }))}
                        className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                      >
                        全选
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(treeFilterConditions.types).map(([type, checked]) => (
                        <div key={type} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`tree-filter-type-${type}`}
                            checked={checked}
                            onChange={(e) => setTreeFilterConditions(prev => ({
                              ...prev,
                              types: {
                                ...prev.types,
                                [type]: e.target.checked
                              }
                            }))}
                            className="w-4 h-4 rounded text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-white/15 dark:bg-black/25 border border-white/30 dark:border-black/40 transition-all duration-200"
                          />
                          <label htmlFor={`tree-filter-type-${type}`} className="text-sm text-[var(--foreground)]">
                            {type}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 风险等级过滤 - 多选 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">风险等级（FILE/EXEC类型）</label>
                      <button
                        onClick={() => setTreeFilterConditions(prev => ({
                          ...prev,
                          riskLevels: {
                            'HIGH': true,
                            'MEDIUM': true,
                            'LOW': true,
                            'INFO': true
                          }
                        }))}
                        className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                      >
                        全选
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(treeFilterConditions.riskLevels).map(([level, checked]) => (
                        <div key={level} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`tree-filter-risk-${level}`}
                            checked={checked}
                            onChange={(e) => setTreeFilterConditions(prev => ({
                              ...prev,
                              riskLevels: {
                                ...prev.riskLevels,
                                [level]: e.target.checked
                              }
                            }))}
                            className="w-4 h-4 rounded text-[var(--accent-blue)] focus:ring-[var(--accent-blue)] bg-white/15 dark:bg-black/25 border border-white/30 dark:border-black/40 transition-all duration-200"
                          />
                          <label htmlFor={`tree-filter-risk-${level}`} className="text-sm text-[var(--foreground)]">
                            {level === 'HIGH' ? '高风险' : level === 'MEDIUM' ? '中风险' : level === 'LOW' ? '低风险' : '信息'}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 清除过滤按钮 */}
                  <button
                    className="w-full px-4 py-1.5 rounded-xl bg-white/10 dark:bg-black/20 border border-black/20 dark:border-white/20 text-[var(--foreground)] text-sm hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200"
                    onClick={() => setTreeFilterConditions({
                      types: {
                        'HTTP': true,
                        'LLM': true,
                        'AGENT': true,
                        'RAG': true,
                        'MCP': true,
                        'AG-UI': true,
                        'FILE': true,
                        'EXEC': true,
      'TOOLCALL': true,
                        'OPENCLAW': true,
                        'UNKNOWN': true
                      },
                      riskLevels: {
                        'HIGH': true,
                        'MEDIUM': true,
                        'LOW': true,
                        'INFO': true
                      },
                      searchKeyword: ''
                    })}
                  >
                    清除所有过滤
                  </button>
                </div>
              )}
            </>
          )}
          
          {/* 会话时序图页面的工具栏 */}
          {activeTab === 'sessionTimeline' && (
            <>
              {/* 会话时序图工具栏 - 始终显示 */}
              <div className="relative p-2">
                {/* 工具栏容器，保持与其他工具栏相同的样式 */}
                <div className="relative rounded-full overflow-hidden">
                  {/* 会话时序图控制区域 */}
                  <div className="w-full">
                    {/* 基础样式容器 - 居中对齐 */}
                    <div className="w-full py-1 px-6 rounded-full text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-opacity-30 transition-all duration-300 flex items-center justify-between">
                      {/* 左侧：会话信息显示 */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] transition-all duration-200 ease-in-out">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="text-sm text-[var(--foreground)] font-medium">会话时序图</div>
                      </div>
                      
                      {/* 右侧：展开/收起按钮 */}
                      <button
                        className="p-1.5 rounded-full bg-white/10 dark:bg-black/20 text-[var(--accent-blue)] hover:bg-white/20 dark:hover:bg-black/30 transition-all duration-200 ease-in-out"
                        onClick={() => setIsDockExpanded(!isDockExpanded)}
                        title={isDockExpanded ? '收起' : '展开'}
                        style={{
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)'
                        }}
                      >
                        <svg 
                          className={`w-4 h-4 transition-transform duration-300 ease-in-out ${
                            isDockExpanded ? 'rotate-0' : 'rotate-180'
                          }`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 展开时显示的高级功能选项 */}
              {isDockExpanded && (
                <div 
                  className="grid grid-cols-1 gap-3 px-4 pb-3 pt-1"
                  style={{
                    animation: 'fadeInUp 0.3s ease-out forwards'
                  }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">使用说明</label>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      会话时序图展示服务器间的流量交互关系，支持悬停查看详细信息、点击跳转日志详情。
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">功能特性</label>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-[var(--success)]/80" />
                        <span className="text-[var(--foreground)]">流量可视化</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-[var(--warning)]/80" />
                        <span className="text-[var(--foreground)]">实时悬停详情</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-[var(--accent-blue)]/80" />
                        <span className="text-[var(--foreground)]">日志快速跳转</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
      
      {/* 添加CSS动画 */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <main className={`${isWideScreen ? 'w-full' : 'max-w-7xl mx-auto'} px-6 py-8 transition-all duration-300`}>
        <div className="mb-8 flex items-center justify-center gap-4">
          <FloatingTab
            isActive={activeTab === 'security'}
            onClick={() => setActiveTab('security')}
            label="智能防护"
          />
          <TabSwitcher
            tabs={[
              { id: 'logs', label: '实时日志' },
              { id: 'globalTimeline', label: '时间轴视图' },
              { id: 'process', label: '进程分类分析' },
              { id: 'timeline', label: '会话级时间轴' },
              { id: 'sessionTimeline', label: '会话级时序图' },
              { id: 'tree', label: '会话级分析' }
            ]}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[var(--border-color)] border-t-[var(--accent-blue)] rounded-full animate-spin mx-auto mb-4" />
              <p className="text-[var(--text-secondary)]">加载中...</p>
            </div>
          </div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            >
              {activeTab === 'security' && <SecurityShield />}
            </motion.div>

            {activeTab !== 'security' && (
              <>
            {activeTab === 'logs' && (
              <>
                {/* 根据开关状态显示汇总卡片 */}
                {showSummaryCards && (
                  <>
                    {/* 时间范围滑块 */}
                    <TimeRangeSlider
                      startTime={allLogsTimeRange.start}
                      endTime={allLogsTimeRange.end}
                      initialRange={logTimeRange}
                      onTimeRangeChange={setLogTimeRange}
                      onTimeRangeChangeEnd={handleTimeRangeChangeEnd}
                      autoRefresh={autoRefresh}
                    />
                    
                    {/* 第一组卡片 - 总请求数、非HTTP请求数量、总Token数、平均延迟 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0,
                        pointerEvents: 'auto'
                      }}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
                    >
                      <StatCard
                        title="总日志数"
                        value={stats?.totalRequests || 0}
                        icon={Activity}
                        gradient="blue"
                        onClick={() => setFilterConditions(prev => ({ ...prev, types: {
                          'HTTP': true,
                          'LLM': true,
                          'AGENT': true,
                          'RAG': true,
                          'MCP': true,
                          'AG-UI': true,
                          'FILE': true,
                          'EXEC': true,
      'TOOLCALL': true,
                          'OPENCLAW': true,
                          'UNKNOWN': true
                        } }))}
                      />
                      <StatCard
                        title="关键服务日志数"
                        value={stats?.activeSessions || 0}
                        icon={Server}
                        gradient="purple"
                        onClick={() => {
                          setFilterConditions(prev => ({
                            ...prev,
                            types: {
                              'HTTP': false,
                              'LLM': false,
                              'AGENT': false,
                              'RAG': false,
                              'MCP': false,
                              'AG-UI': true,
                              'FILE': false,
                              'EXEC': false,
                              'TOOLCALL': false,
                              'OPENCLAW': true,
                              'UNKNOWN': false
                            }
                          }));
                        }}
                      />
                      <StatCard
                        title="总 Token 数"
                        value={stats?.totalTokens || 0}
                        icon={Zap}
                        gradient="cyan"
                      />
                      <StatCard
                        title="平均延迟"
                        value={`${(stats?.averageLatency || 0).toFixed(0)}ms`}
                        icon={Clock}
                        gradient="emerald"
                      />
                    </motion.div>

                    {/* 第二组卡片 - 请求趋势和请求类型分布 */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ 
                        opacity: 1, 
                        y: 0,
                        pointerEvents: 'auto'
                      }}
                      transition={{ duration: 0.4, ease: 'easeInOut', delay: 0.1 }}
                      className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
                    >
                      {/* 请求趋势图表 */}
                      <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/50 overflow-hidden shadow-sm">
                        <RequestsChart stats={stats} />
                      </div>
                      
                      {/* 请求类型分布 */}
                      <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                        <div className="p-6">
                          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">日志类型分布</h3>
                          {/* 左右布局容器 */}
                          {stats?.requestsByType && Object.keys(stats.requestsByType).length > 0 && (
                            <div className="flex flex-col md:flex-row gap-6">
                              {/* 左侧饼图 */}
                              <div className="w-full md:w-1/3 h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={Object.entries(stats.requestsByType).map(([name, value]) => ({ name, value }))}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={45}
                                      outerRadius={65}
                                      paddingAngle={2}
                                      dataKey="value"
                                      stroke="var(--background)"
                                      strokeWidth={2}
                                    >
                                      {Object.entries(stats.requestsByType).map(([name, value], index) => (
                                        <Cell 
                                          key={`cell-${index}`} 
                                          fill={getDataTypeColor(name)}
                                        />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      contentStyle={{
                                        backgroundColor: 'var(--card-background)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        color: 'var(--foreground)',
                                      }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              {/* 右侧分布比例图 */}
                              <div className="w-full md:w-2/3">
                                <div className="space-y-2">
                                  {stats?.requestsByType && Object.entries(stats.requestsByType).map(([type, count]) => (
                                    <div 
                                      key={type} 
                                      className={`flex items-center justify-between cursor-pointer p-2 rounded-lg transition-all duration-200 ${!(filterConditions.types as Record<string, boolean>)[type] ? 'opacity-50' : 'hover:bg-[var(--background-hover)]'}`}
                                      onClick={() => {
                                        setFilterConditions(prev => ({
                                          ...prev,
                                          types: {
                                            ...prev.types,
                                            HTTP: type === 'HTTP',
                                            LLM: type === 'LLM',
                                            AGENT: type === 'AGENT',
                                            RAG: type === 'RAG',
                                            MCP: type === 'MCP',
                                            'AG-UI': type === 'AG-UI',
                                            FILE: type === 'FILE',
                                            EXEC: type === 'EXEC',
                                            TOOLCALL: type === 'TOOLCALL',
                                            OPENCLAW: type === 'OPENCLAW',
                                            UNKNOWN: type === 'UNKNOWN'
                                          }
                                        }));
                                      }}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div 
                                          className="w-3 h-3 rounded-full"
                                          style={{
                                            backgroundColor: getDataTypeColor(type)
                                          }}
                                        />
                                        <span className="text-sm font-medium text-[var(--foreground)]">{type}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-[var(--foreground)]">{count}</span>
                                        <div className="w-24 h-2 bg-[var(--border-color)]/50 rounded-full overflow-hidden">
                                          <div 
                                            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-gray-400 to-gray-600"
                                            style={{ 
                                              width: `${Math.min(100, (count / (stats?.totalRequests || 1)) * 100)}%`
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </>
            )}

            {/* 内容区域 */}
            <div ref={logsRef} className="space-y-6">
              {/* 实时日志 */}
              {activeTab === 'logs' && (
                <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">实时日志</h2>
                    <div className="space-y-4">
                      {filteredLogs.length === 0 ? (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 mx-auto mb-4 text-[var(--text-secondary)]">
                            <Activity className="w-full h-full" />
                          </div>
                          <p className="text-[var(--text-secondary)]">暂无日志数据</p>
                        </div>
                      ) : (
                        <>
                          {/* 只渲染当前显示数量的日志 */}
                          {filteredLogs.slice(0, displayedLogsCount).map((log, index) => (
                            <LogEntryCard
                              key={log.logID || index}
                              entry={log}
                              index={index}
                              onTimelineClick={handleTimelineClick}
                              onTreeClick={handleTreeClick}
                              onSessionTimelineClick={handleSessionTimelineClick}
                            />
                          ))}
                          
                          {/* 加载更多指示器 */}
                          <div ref={loadMoreRef} className="flex justify-center items-center py-6">
                            {loadingMore ? (
                              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                <div className="w-5 h-5 border-2 border-[var(--text-secondary)] border-t-[var(--accent-blue)] rounded-full animate-spin" />
                                <span>加载中...</span>
                              </div>
                            ) : displayedLogsCount < filteredLogs.length ? (
                              <button
                                onClick={loadMoreLogs}
                                className="px-4 py-2 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] rounded-lg hover:bg-[var(--accent-blue)]/20 transition-colors"
                              >
                                加载更多 ({displayedLogsCount}/{filteredLogs.length})
                              </button>
                            ) : (
                              <span className="text-[var(--text-secondary)]">已显示全部 {filteredLogs.length} 条日志</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 全局时间轴视图 */}
              {activeTab === 'globalTimeline' && (
                <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <GlobalTimelineView 
                      logs={logs} 
                      onViewLog={handleViewLog}
                    />
                  </div>
                </div>
              )}

              {/* 会话时间轴 */}
              {activeTab === 'timeline' && (
                <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <TimelineView 
                      logs={logs} 
                      timeRange={timelineTimeRange}
                      onTimeRangeChange={handleTimelineTimeRangeChange}
                      eventFilters={timelineEventFilters}
                      targetSessionId={targetSessionId}
                      onViewLog={handleViewLog}
                    />
                  </div>
                </div>
              )}

              {/* 会话级分析 */}
              {activeTab === 'tree' && (
                <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <TreeView 
                      logs={logs} 
                      targetSessionId={targetSessionId}
                      filterConditions={treeFilterConditions}
                      onTypeFilterClick={handleTreeTypeFilterClick}
                      onNavigateToSecurity={() => {
                        setActiveTab('security');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 会话级时序图 */}
              {activeTab === 'sessionTimeline' && (
                <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <SessionTimelineView 
                      logs={logs} 
                      targetSessionId={targetSessionId}
                      onViewLog={handleViewLog}
                    />
                  </div>
                </div>
              )}

              {/* 进程树视图 */}
              {activeTab === 'process' && (
                <div className="bg-[var(--card-background)]/50 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/30 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <ProcessTreeView 
                      logs={logs} 
                      searchKeyword={processTreeFilterConditions.searchKeyword}
                      filteredProcessTypes={processTreeFilterConditions.processTypes}
                      filteredLogTypes={processTreeFilterConditions.logTypes}
                    />
                  </div>
                </div>
              )}
            </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}