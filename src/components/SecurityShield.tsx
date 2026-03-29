'use client';

import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { useTheme } from '@/context/ThemeContext';
import { useProtectionRule } from '@/context/ProtectionRuleContext';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Lock,
  AlertTriangle,
  Eye,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  Code,
  Terminal,
  Cloud,
  Container,
  GitBranch,
  Server,
  Zap,
  Activity,
  RefreshCw,
  Search,
  Layers,
  ShieldQuestion,
  ShieldX,
  Power,
  Loader2,
  Download,
  Package,
  AlertCircle,
  Settings,
  Trash,
  Info,
  Bug,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  Filter,
  Wrench,
  FileCode,
  Database,
  Globe,
  FolderOpen,
  Sparkles,
} from 'lucide-react';

interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  rules: {
    block: Record<string, string>;
    confirm: Record<string, string>;
    warn: Record<string, string>;
  };
  stats: {
    totalRules: number;
    blockCount: number;
    confirmCount: number;
    warnCount: number;
  };
}

interface CustomRule {
  id: string;
  pattern: string;
  description: string;
  type: 'block' | 'confirm' | 'warn';
  originalPattern?: string;
  originalType?: 'block' | 'confirm' | 'warn';
}

interface PrimaryRules {
  name: string;
  description: string;
  version: string;
  source: string | null;
  rules: {
    block: Record<string, string>;
    confirm: Record<string, string>;
    warn: Record<string, string>;
  };
}

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type ProtectionAction = 'block' | 'confirm' | 'confirm_required' | 'warn' | 'allow';

interface JournalLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  raw: string;
  subsystem?: string;
  fileName?: string;
  plugin?: string;
  category?: string;
  action?: ProtectionAction;
  data?: {
    toolName?: string;
    rule?: string;
    pattern?: string;
    input?: string;
    message?: string;
    [key: string]: unknown;
  };
}

interface LogStats {
  total: number;
  trace: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
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
    action: ProtectionAction;
    toolName?: string;
    message: string;
    rule?: string;
    data?: JournalLog['data'];
  }>;
}

interface ProtectionStatus {
  isEnabled: boolean;
  isInstalled: boolean;
  status: 'loaded' | 'disabled' | 'not_installed' | 'loading' | 'error';
  version?: string;
  message?: string;
  openclawVersion?: string;
  gatewayPort?: string;
}

const ruleTypeConfig = {
  block: {
    label: '拦截',
    color: 'bg-red-500',
    textColor: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    gradient: 'from-red-500 to-rose-600',
    Icon: ShieldX,
    description: '直接阻止请求，记录日志',
  },
  confirm: {
    label: '确认',
    color: 'bg-orange-500',
    textColor: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    gradient: 'from-orange-500 to-amber-600',
    Icon: ShieldQuestion,
    description: '需要用户确认后才能继续',
  },
  warn: {
    label: '警告',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    gradient: 'from-yellow-500 to-amber-600',
    Icon: AlertTriangle,
    description: '记录警告，允许请求通过',
  },
} as const;

const actionConfig = {
  block: { 
    ...ruleTypeConfig.block, 
    label: '已拦截', 
    labelShort: '拦截',
    gradient: 'from-red-500 to-rose-600',
    Icon: ShieldX,
  },
  confirm: { 
    label: '已确认', 
    labelShort: '确认',
    color: 'bg-green-500', 
    textColor: 'text-green-500', 
    bgColor: 'bg-green-500/10', 
    borderColor: 'border-green-500/30', 
    gradient: 'from-green-500 to-emerald-600',
    Icon: Check,
    description: '用户已确认执行',
  },
  confirm_required: { 
    label: '待确认', 
    labelShort: '待确认',
    color: 'bg-amber-500', 
    textColor: 'text-amber-500', 
    bgColor: 'bg-amber-500/10', 
    borderColor: 'border-amber-500/30', 
    gradient: 'from-amber-500 to-orange-600',
    Icon: ShieldQuestion,
    description: '等待用户确认',
    isPending: true,
  },
  warn: { 
    ...ruleTypeConfig.warn, 
    label: '已警告', 
    labelShort: '警告',
    gradient: 'from-yellow-500 to-amber-600',
    Icon: AlertTriangle,
  },
  allow: { 
    label: '已放行', 
    labelShort: '放行',
    color: 'bg-blue-500', 
    textColor: 'text-blue-500', 
    bgColor: 'bg-blue-500/10', 
    borderColor: 'border-blue-500/30', 
    gradient: 'from-blue-500 to-indigo-600', 
    Icon: Check, 
    description: '允许通过' 
  },
} as const;

const logLevelConfig = {
  trace: { label: 'TRACE', color: 'bg-gray-400', textColor: 'text-gray-400', bgColor: 'bg-gray-400/10', Icon: Bug },
  debug: { label: 'DEBUG', color: 'bg-cyan-500', textColor: 'text-cyan-500', bgColor: 'bg-cyan-500/10', Icon: Bug },
  info: { label: 'INFO', color: 'bg-blue-500', textColor: 'text-blue-500', bgColor: 'bg-blue-500/10', Icon: Info },
  warn: { label: 'WARN', color: 'bg-yellow-500', textColor: 'text-yellow-500', bgColor: 'bg-yellow-500/10', Icon: AlertTriangle },
  error: { label: 'ERROR', color: 'bg-red-500', textColor: 'text-red-500', bgColor: 'bg-red-500/10', Icon: AlertCircle },
  fatal: { label: 'FATAL', color: 'bg-red-700', textColor: 'text-red-700', bgColor: 'bg-red-700/10', Icon: ShieldX },
} as const;

const toolIconMap: Record<string, React.ElementType> = {
  read: FileText,
  write: FileCode,
  edit: Edit3,
  exec: Terminal,
  bash: Terminal,
  shell: Terminal,
  search: Search,
  glob: Search,
  grep: Search,
  ls: FolderOpen,
  list: FolderOpen,
  fetch: Globe,
  http: Globe,
  database: Database,
  sql: Database,
  default: Wrench,
};

const RuleTypeIcon = ({ type, className }: { type: 'block' | 'confirm' | 'warn'; className?: string }) => {
  const IconComponent = ruleTypeConfig[type].Icon;
  return <IconComponent className={className} />;
};

const CombinedRuleDistributionBar = ({ 
  templateBlock, 
  templateConfirm, 
  templateWarn,
  customBlock,
  customConfirm,
  customWarn,
  isDarkMode 
}: { 
  templateBlock: number; 
  templateConfirm: number; 
  templateWarn: number;
  customBlock: number;
  customConfirm: number;
  customWarn: number;
  isDarkMode: boolean;
}) => {
  const total = templateBlock + templateConfirm + templateWarn + customBlock + customConfirm + customWarn;
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const segments = [
    { 
      id: 'template-block',
      count: templateBlock, 
      label: '模板阻断',
      source: '模板',
      type: '阻断',
      color: 'bg-red-500',
      lightColor: 'bg-red-400',
      percentage: total > 0 ? (templateBlock / total) * 100 : 0
    },
    { 
      id: 'custom-block',
      count: customBlock, 
      label: '自定义阻断',
      source: '自定义',
      type: '阻断',
      color: 'bg-rose-400',
      lightColor: 'bg-rose-300',
      percentage: total > 0 ? (customBlock / total) * 100 : 0
    },
    { 
      id: 'template-confirm',
      count: templateConfirm, 
      label: '模板确认',
      source: '模板',
      type: '确认',
      color: 'bg-orange-500',
      lightColor: 'bg-orange-400',
      percentage: total > 0 ? (templateConfirm / total) * 100 : 0
    },
    { 
      id: 'custom-confirm',
      count: customConfirm, 
      label: '自定义确认',
      source: '自定义',
      type: '确认',
      color: 'bg-amber-400',
      lightColor: 'bg-amber-300',
      percentage: total > 0 ? (customConfirm / total) * 100 : 0
    },
    { 
      id: 'template-warn',
      count: templateWarn, 
      label: '模板警告',
      source: '模板',
      type: '警告',
      color: 'bg-yellow-500',
      lightColor: 'bg-yellow-400',
      percentage: total > 0 ? (templateWarn / total) * 100 : 0
    },
    { 
      id: 'custom-warn',
      count: customWarn, 
      label: '自定义警告',
      source: '自定义',
      type: '警告',
      color: 'bg-amber-300',
      lightColor: 'bg-amber-200',
      percentage: total > 0 ? (customWarn / total) * 100 : 0
    },
  ];

  const templateTotal = templateBlock + templateConfirm + templateWarn;
  const customTotal = customBlock + customConfirm + customWarn;

  return (
    <div className="relative py-1">
      <div className={`h-2 w-full rounded-full overflow-hidden flex ${
        isDarkMode ? 'bg-gray-700/30' : 'bg-gray-200/60'
      }`}>
        {segments.map((segment, index) => (
          segment.percentage > 0 && (
            <motion.div
              key={segment.id}
              className={`relative ${segment.color} cursor-pointer`}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: `${segment.percentage}%`, opacity: 1 }}
              transition={{ duration: 0.6, delay: index * 0.05, ease: 'easeOut' }}
              onMouseEnter={() => setHoveredSegment(segment.id)}
              onMouseLeave={() => setHoveredSegment(null)}
              whileHover={{ opacity: 0.8 }}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', delay: index * 0.2 }}
              />
            </motion.div>
          )
        ))}
      </div>

      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600" />
          <span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            模板
          </span>
          <span className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {templateTotal}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-gradient-to-br from-purple-500 to-pink-600" />
          <span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            自定义
          </span>
          <span className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {customTotal}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>阻断</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>确认</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>警告</span>
        </div>
      </div>

      <AnimatePresence>
        {hoveredSegment && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 pointer-events-none left-1/2 -translate-x-1/2 -top-10"
          >
            <div className={`px-2.5 py-1.5 rounded-lg text-[11px] whitespace-nowrap ${
              isDarkMode 
                ? 'bg-gray-800/95 border border-gray-700/50 shadow-xl backdrop-blur-sm' 
                : 'bg-white/95 border border-gray-200 shadow-xl backdrop-blur-sm'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${segments.find(s => s.id === hoveredSegment)?.color}`} />
                <span className="font-medium text-[var(--foreground)]">
                  {segments.find(s => s.id === hoveredSegment)?.label}
                </span>
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>
                  {segments.find(s => s.id === hoveredSegment)?.count}
                </span>
                <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                  isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                }`}>
                  {segments.find(s => s.id === hoveredSegment)?.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const templateIcons: Record<string, React.ReactNode> = {
  'cloud-aws': <Cloud className="w-5 h-5" />,
  'database-sql': <Container className="w-5 h-5" />,
  'docker': <Container className="w-5 h-5" />,
  'filesystem': <FileText className="w-5 h-5" />,
  'git': <GitBranch className="w-5 h-5" />,
  'kubernetes': <Server className="w-5 h-5" />,
  'minimal': <Shield className="w-5 h-5" />,
  'production-strict': <Lock className="w-5 h-5" />,
};

const templateDisplayNames: Record<string, string> = {
  'cloud-aws': 'AWS 云服务',
  'database-sql': '数据库 SQL',
  'docker': 'Docker 容器',
  'filesystem': '文件系统',
  'git': 'Git 版本控制',
  'kubernetes': 'Kubernetes',
  'minimal': '最小规则集',
  'production-strict': '生产严格模式',
};

const templateGradients: Record<string, string> = {
  'cloud-aws': 'from-orange-400 to-amber-500',
  'database-sql': 'from-blue-400 to-indigo-500',
  'docker': 'from-cyan-400 to-blue-500',
  'filesystem': 'from-emerald-400 to-teal-500',
  'git': 'from-rose-400 to-pink-500',
  'kubernetes': 'from-violet-400 to-purple-500',
  'minimal': 'from-gray-400 to-slate-500',
  'production-strict': 'from-red-400 to-rose-500',
};

const GlassCard = ({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const { isDarkMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`relative overflow-hidden rounded-3xl ${
        isDarkMode ? 'bg-gray-800/40' : 'bg-white/80'
      } backdrop-blur-2xl border ${
        isDarkMode ? 'border-white/5' : 'border-gray-100'
      } shadow-xl ${className}`}
    >
      {children}
    </motion.div>
  );
};

const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  isDarkMode,
  action
}: { 
  icon: React.ElementType; 
  title: string; 
  description: string; 
  isDarkMode: boolean;
  action?: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-12"
  >
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', bounce: 0.5 }}
      className={`w-20 h-20 mb-4 rounded-2xl bg-gradient-to-br ${
        isDarkMode ? 'from-gray-600/30 to-gray-700/30' : 'from-gray-100 to-gray-200'
      } flex items-center justify-center shadow-lg`}
    >
      <Icon className={`w-10 h-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`} />
    </motion.div>
    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">{title}</h3>
    <p className="text-sm text-[var(--text-secondary)] text-center max-w-xs mb-4">{description}</p>
    {action}
  </motion.div>
);

const ActivityCardSkeleton = ({ isDarkMode }: { isDarkMode: boolean }) => (
  <div className={`rounded-2xl p-4 ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'} animate-pulse`}>
    <div className="flex items-start gap-3.5">
      <div className={`w-11 h-11 rounded-xl ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className={`h-5 w-16 rounded-full ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
          <div className={`h-4 w-12 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
          <div className={`h-4 w-20 rounded ml-auto ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
        </div>
        <div className={`h-4 w-3/4 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
        <div className={`h-3 w-1/2 rounded ${isDarkMode ? 'bg-gray-600' : 'bg-gray-200'}`} />
      </div>
    </div>
  </div>
);

const LogItemSkeleton = ({ isDarkMode }: { isDarkMode: boolean }) => (
  <div className={`px-6 py-3.5 border-b ${isDarkMode ? 'border-gray-700/30' : 'border-gray-100'} animate-pulse`}>
    <div className="flex items-start gap-3">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <div className={`h-5 w-14 rounded-full ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className={`h-4 w-16 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
          <div className={`h-4 w-20 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
        </div>
        <div className={`h-4 w-2/3 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
      </div>
    </div>
  </div>
);

const ActivityCard = memo(({ 
  activity, 
  index,
  isDarkMode 
}: { 
  activity: ProtectionStats['recentActivity'][0];
  index: number;
  isDarkMode: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = actionConfig[activity.action] || actionConfig.warn;
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  const parseMessageJson = () => {
    if (activity.message) {
      try {
        const parsed = JSON.parse(activity.message);
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  };

  const messageJson = parseMessageJson();

  const getCardTitle = () => {
    if (messageJson?.message) {
      return messageJson.message;
    }
    if (activity.message && !messageJson) {
      const parts = activity.message.split(' - ');
      return parts[0] || activity.message;
    }
    return `安全事件 #${index + 1}`;
  };

  const getCardSummary = () => {
    return null;
  };

  const fieldLabelMap: Record<string, string> = {
    action: '操作',
    toolName: '工具',
    rule: '规则',
    input: '输入',
    path: '路径',
    command: '命令',
    url: '地址',
    content: '内容',
    message: '消息',
    data: '数据',
  };

  const actionLabelMap: Record<string, string> = {
    block: '拦截',
    confirm: '已确认',
    confirm_required: '待确认',
    warn: '警告',
    allow: '放行',
  };

  const getKeyFields = () => {
    const fields: { key: string; label: string; value: string }[] = [];
    
    if (messageJson) {
      if (messageJson.action) {
        fields.push({ 
          key: 'action', 
          label: '操作', 
          value: actionLabelMap[messageJson.action] || messageJson.action 
        });
      }
      if (messageJson.data?.toolName) {
        fields.push({ key: 'toolName', label: '工具', value: messageJson.data.toolName });
      }
      if (messageJson.data?.rule) {
        fields.push({ key: 'rule', label: '规则', value: messageJson.data.rule });
      }
      if (messageJson.data?.input) {
        try {
          const inputParsed = JSON.parse(messageJson.data.input);
          const inputKeys = Object.keys(inputParsed).filter(k => k !== '_sec_confirm');
          inputKeys.slice(0, 2).forEach(key => {
            const val = typeof inputParsed[key] === 'object' 
              ? JSON.stringify(inputParsed[key]) 
              : String(inputParsed[key]);
            fields.push({ 
              key, 
              label: fieldLabelMap[key] || key, 
              value: val.length > 50 ? val.substring(0, 50) + '...' : val 
            });
          });
        } catch {
          fields.push({ key: 'input', label: '输入', value: messageJson.data.input.substring(0, 50) + '...' });
        }
      }
    } else if (activity.data?.input) {
      try {
        const parsed = JSON.parse(activity.data.input);
        const keys = Object.keys(parsed).filter(k => k !== '_sec_confirm');
        keys.slice(0, 3).forEach(key => {
          const val = typeof parsed[key] === 'object' 
            ? JSON.stringify(parsed[key]) 
            : String(parsed[key]);
          fields.push({ 
            key, 
            label: fieldLabelMap[key] || key, 
            value: val.length > 50 ? val.substring(0, 50) + '...' : val 
          });
        });
      } catch {
        fields.push({ key: 'input', label: '输入', value: activity.data.input.substring(0, 50) + '...' });
      }
    }
    
    return fields;
  };

  const keyFields = getKeyFields();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`group relative rounded-2xl overflow-hidden transition-all duration-300 ${
        isDarkMode 
          ? 'bg-gray-800/50 hover:bg-gray-800/70' 
          : 'bg-white hover:bg-gray-50/80'
      } border ${isDarkMode ? 'border-gray-700/40' : 'border-gray-200/60'} shadow-sm hover:shadow-md`}
    >
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center flex-shrink-0`}>
            <config.Icon className="w-5 h-5 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-sm font-semibold text-[var(--foreground)]`}>
                {getCardTitle()}
              </span>
              <span className="text-xs text-[var(--text-secondary)]">
                {formatTime(activity.timestamp)}
              </span>
            </div>
            
            {keyFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {keyFields.slice(0, 4).map((field, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-xs">
                    <span className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {field.label}
                    </span>
                    <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} max-w-[120px] truncate`}>
                      {field.value}
                    </span>
                  </div>
                ))}
                {keyFields.length > 4 && (
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    +{keyFields.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
          
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className={`w-8 h-8 rounded-full ${
              isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'
            } flex items-center justify-center flex-shrink-0`}
          >
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          </motion.div>
        </div>
      </div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className={`px-4 pb-4 pt-4 border-t ${isDarkMode ? 'border-gray-700/30' : 'border-gray-100'}`}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-900/30' : 'bg-gray-50/80'}`}>
                    <div className="text-xs text-[var(--text-secondary)] mb-1">时间</div>
                    <div className="text-sm text-[var(--foreground)]">
                      {new Date(activity.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-900/30' : 'bg-gray-50/80'}`}>
                    <div className="text-xs text-[var(--text-secondary)] mb-1">状态</div>
                    <div className={`text-sm ${config.textColor}`}>
                      {config.label}
                    </div>
                  </div>
                  {activity.rule && (
                    <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-900/30' : 'bg-gray-50/80'}`}>
                      <div className="text-xs text-[var(--text-secondary)] mb-1">规则</div>
                      <code className="text-sm text-[var(--foreground)]">{activity.rule}</code>
                    </div>
                  )}
                  {activity.toolName && (
                    <div className={`p-3 rounded-xl ${isDarkMode ? 'bg-gray-900/30' : 'bg-gray-50/80'}`}>
                      <div className="text-xs text-[var(--text-secondary)] mb-1">工具</div>
                      <div className="text-sm text-[var(--foreground)]">{activity.toolName}</div>
                    </div>
                  )}
                </div>

                {messageJson && (
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2">原始数据</div>
                    <pre className={`text-xs p-3 rounded-xl overflow-x-auto ${
                      isDarkMode ? 'bg-gray-900/50' : 'bg-gray-50'
                    } text-[var(--foreground)] font-mono`}>
                      {JSON.stringify(messageJson, null, 2)}
                    </pre>
                  </div>
                )}

                {!messageJson && activity.data?.input && (
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2">输入参数</div>
                    <pre className={`text-xs p-3 rounded-xl overflow-x-auto ${
                      isDarkMode ? 'bg-gray-900/50' : 'bg-gray-50'
                    } text-[var(--foreground)] font-mono`}>
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(activity.data.input), null, 2);
                        } catch {
                          return activity.data.input;
                        }
                      })()}
                    </pre>
                  </div>
                )}

                {!messageJson && activity.data && Object.keys(activity.data).length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2">完整数据</div>
                    <pre className={`text-xs p-3 rounded-xl overflow-x-auto ${
                      isDarkMode ? 'bg-gray-900/50' : 'bg-gray-50'
                    } text-[var(--text-secondary)] font-mono`}>
                      {JSON.stringify(activity.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

ActivityCard.displayName = 'ActivityCard';

const LogItem = memo(({ log, index }: { log: JournalLog; index: number }) => {
  const { isDarkMode } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const config = logLevelConfig[log.level] || logLevelConfig.info;
  
  const isAIGovLog = log.plugin === 'AIGov-Insight' && log.category === 'security';
  const actionCfg = isAIGovLog && log.action ? actionConfig[log.action] : null;

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const getLogTitle = () => {
    if (log.data?.message) {
      return log.data.message;
    }
    if (log.message) {
      const parts = log.message.split(' - ');
      return parts[0] || log.message;
    }
    return `日志条目 #${index + 1}`;
  };

  const getLogSummary = () => {
    if (log.data?.rule) {
      return `规则: ${log.data.rule}`;
    }
    if (log.message && log.message.includes(' - ')) {
      return log.message.split(' - ').slice(1).join(' - ');
    }
    if (log.subsystem) {
      return `子系统: ${log.subsystem}`;
    }
    return null;
  };

  const getGradient = () => {
    if (actionCfg) {
      return actionCfg.gradient;
    }
    switch (log.level) {
      case 'error':
      case 'fatal':
        return 'from-red-500 to-rose-600';
      case 'warn':
        return 'from-yellow-500 to-amber-600';
      case 'info':
        return 'from-blue-500 to-indigo-600';
      case 'debug':
      case 'trace':
        return 'from-cyan-500 to-teal-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.015, 0.3), ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`group relative ${
        isExpanded 
          ? isDarkMode 
            ? 'bg-gradient-to-r from-gray-800/60 to-transparent' 
            : 'bg-gradient-to-r from-gray-50 to-transparent'
          : ''
      } transition-all duration-300 border-b ${isDarkMode ? 'border-gray-700/30' : 'border-gray-100'}`}
    >
      <div 
        className={`px-6 py-3.5 cursor-pointer transition-all duration-200`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {actionCfg ? (
                <span className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gradient-to-r ${actionCfg.gradient} text-white`}>
                  {actionCfg.label}
                </span>
              ) : (
                <span className={`inline-flex items-center text-[11px] px-2.5 py-1 rounded-full font-semibold bg-gradient-to-r ${getGradient()} text-white`}>
                  {config.label}
                </span>
              )}
              
              {log.data?.toolName && (
                <span className={`text-[11px] px-2 py-0.5 rounded-lg ${
                  isDarkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-100 text-gray-600'
                } font-mono`}>
                  {log.data.toolName}
                </span>
              )}
              
              <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                {formatTime(log.timestamp)}
              </span>
              
              {log.plugin && (
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-500 font-medium border border-indigo-500/20">
                  {log.plugin}
                </span>
              )}
            </div>
            
            <h4 className="text-sm text-[var(--foreground)] font-semibold leading-relaxed mb-0.5">
              {getLogTitle()}
            </h4>
            
            {!isExpanded && getLogSummary() && (
              <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                {getLogSummary()}
              </p>
            )}
          </div>
          
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'
            } opacity-0 group-hover:opacity-100 transition-all duration-200`}
          >
            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
          </motion.div>
        </div>
      </div>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className={`px-6 pb-4 pt-3 mx-6 mb-4 rounded-2xl ${
              isDarkMode ? 'bg-gray-800/60 border border-gray-700/30' : 'bg-gray-50 border border-gray-100'
            }`}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`p-3.5 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-white'} border ${isDarkMode ? 'border-gray-600/20' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mb-1">
                      <Clock className="w-3 h-3" />
                      时间
                    </div>
                    <div className="text-sm text-[var(--foreground)] font-medium">
                      {new Date(log.timestamp).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div className={`p-3.5 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-white'} border ${isDarkMode ? 'border-gray-600/20' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mb-1">
                      <Activity className="w-3 h-3" />
                      级别
                    </div>
                    <div className="text-sm text-[var(--foreground)] font-medium">{config.label}</div>
                  </div>
                  {log.data?.toolName && (
                    <div className={`p-3.5 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-white'} border ${isDarkMode ? 'border-gray-600/20' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mb-1">
                        <Wrench className="w-3 h-3" />
                        工具
                      </div>
                      <div className="text-sm text-[var(--foreground)] font-medium">{log.data.toolName}</div>
                    </div>
                  )}
                  {log.data?.rule && (
                    <div className={`p-3.5 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-white'} border ${isDarkMode ? 'border-gray-600/20' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mb-1">
                        <Target className="w-3 h-3" />
                        匹配规则
                      </div>
                      <code className="text-sm text-[var(--foreground)] font-mono">{log.data.rule}</code>
                    </div>
                  )}
                </div>
                
                {log.data?.input && (
                  <div>
                    <div className="text-xs font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
                      <div className={`w-5 h-5 rounded-lg bg-gradient-to-br ${getGradient()} flex items-center justify-center`}>
                        <Terminal className="w-3 h-3 text-white" />
                      </div>
                      输入参数
                    </div>
                    <pre className={`text-xs p-4 rounded-xl overflow-x-auto ${
                      isDarkMode ? 'bg-gray-900/50 border border-gray-700/30' : 'bg-white border border-gray-100'
                    } text-[var(--foreground)] font-mono`}>
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(log.data.input), null, 2);
                        } catch {
                          return log.data.input;
                        }
                      })()}
                    </pre>
                  </div>
                )}
                
                <div>
                  <div className="text-xs font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center`}>
                      <FileText className="w-3 h-3 text-white" />
                    </div>
                    原始日志
                  </div>
                  <pre className={`text-xs p-4 rounded-xl overflow-x-auto max-h-48 ${
                    isDarkMode ? 'bg-gray-900/50 border border-gray-700/30' : 'bg-white border border-gray-100'
                  } text-[var(--text-secondary)] font-mono`}>
                    {log.raw}
                  </pre>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

LogItem.displayName = 'LogItem';

export function SecurityShield() {
  const { isDarkMode } = useTheme();
  const { prefilledRule, clearPrefilledRule, hasPrefilledRule } = useProtectionRule();
  const [activeSection, setActiveSection] = useState<'overview' | 'templates' | 'custom' | 'services'>('overview');
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [primaryRules, setPrimaryRules] = useState<PrimaryRules | null>(null);
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [journalLogs, setJournalLogs] = useState<JournalLog[]>([]);
  const [logStats, setLogStats] = useState<LogStats>({ total: 0, trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 });
  const [protectionStats, setProtectionStats] = useState<ProtectionStats>({
    total: 0,
    block: 0,
    confirm: 0,
    confirmRequired: 0,
    warn: 0,
    allow: 0,
    byTool: {},
    recentActivity: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [protectionStatus, setProtectionStatus] = useState<ProtectionStatus>({ isEnabled: false, isInstalled: false, status: 'loading' });
  const [isTogglingProtection, setIsTogglingProtection] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [logFilter, setLogFilter] = useState<LogLevel | 'all'>('all');
  const [activityFilter, setActivityFilter] = useState<ProtectionAction | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'all' | '1h' | '24h' | '7d' | '30d'>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState('');
  const [showUninstallModal, setShowUninstallModal] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [hasCheckedInstall, setHasCheckedInstall] = useState(false);
  const [displayedActivityCount, setDisplayedActivityCount] = useState(10);
  const [displayedLogCount, setDisplayedLogCount] = useState(20);
  const [isLoadingMoreActivity, setIsLoadingMoreActivity] = useState(false);
  const [isLoadingMoreLogs, setIsLoadingMoreLogs] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const activityContainerRef = useRef<HTMLDivElement>(null);
  const activityScrollHeightRef = useRef<number>(0);
  const logScrollHeightRef = useRef<number>(0);

  useEffect(() => {
    if (hasPrefilledRule && prefilledRule) {
      setActiveSection('custom');
      setIsAddingRule(true);
      setEditingRule({
        id: `new-${Date.now()}`,
        pattern: prefilledRule.pattern,
        description: prefilledRule.description,
        type: prefilledRule.type,
      });
      clearPrefilledRule();
    }
  }, [hasPrefilledRule, prefilledRule, clearPrefilledRule]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/protection/status');
      const data = await res.json();
      setProtectionStatus({
        isEnabled: data.isEnabled || false,
        isInstalled: data.isInstalled || false,
        status: data.status || 'error',
        version: data.version,
        message: data.message,
        openclawVersion: data.openclawVersion,
        gatewayPort: data.gatewayPort,
      });
    } catch (error) {
      console.error('Error fetching status:', error);
      setProtectionStatus({ isEnabled: false, isInstalled: false, status: 'error' });
    }
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [templatesRes, primaryRes, customRes] = await Promise.all([
        fetch('/api/protection/templates'),
        fetch('/api/protection/primary'),
        fetch('/api/protection/custom-rules'),
      ]);

      const templatesData = await templatesRes.json();
      const primaryData = await primaryRes.json();
      const customData = await customRes.json();

      setTemplates(templatesData.templates || []);
      setPrimaryRules(primaryData.primaryRules || null);
      setCustomRules(customData.rules || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchJournalLogs = useCallback(async (updateStats = true) => {
    setIsLoading(true);
    try {
      let url = '/api/protection/journal-logs?limit=500';
      if (logFilter !== 'all') {
        url += `&level=${logFilter}`;
      }
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.success) {
        const logsWithIds = data.logs.map((log: JournalLog, idx: number) => ({
          ...log,
          id: `${log.timestamp}-${idx}-${Math.random().toString(36).substr(2, 9)}`
        }));

        setJournalLogs(logsWithIds);
        if (updateStats) {
          setLogStats(data.stats);
          setProtectionStats(data.protectionStats || {
            total: 0,
            block: 0,
            confirm: 0,
            confirmRequired: 0,
            warn: 0,
            allow: 0,
            byTool: {},
            recentActivity: [],
          });
        }
      }
    } catch (error) {
      console.error('Error fetching journal logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [logFilter]);

  useEffect(() => {
    fetchStatus();
    fetchData();
    fetchJournalLogs(true);
  }, [fetchStatus, fetchData, fetchJournalLogs]);

  useEffect(() => {
    if (logFilter !== 'all') {
      fetchJournalLogs(false);
    }
  }, [logFilter, fetchJournalLogs]);

  useEffect(() => {
    if (protectionStatus.status === 'not_installed' && !isLoading && !hasCheckedInstall) {
      setInstallMessage('');
      setIsInstalling(false);
      setShowInstallModal(true);
      setHasCheckedInstall(true);
    }
  }, [protectionStatus.status, isLoading, hasCheckedInstall]);

  const scrollToBottom = useCallback((container: HTMLDivElement | null, smooth = true) => {
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, []);

  const toggleProtection = async () => {
    setIsTogglingProtection(true);
    try {
      const res = await fetch('/api/protection/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable: !protectionStatus.isEnabled }),
      });
      const data = await res.json();
      if (data.success) {
        setProtectionStatus({
          isEnabled: data.isEnabled,
          isInstalled: data.isInstalled ?? true,
          status: data.status,
          message: data.message,
        });
      }
    } catch (error) {
      console.error('Error toggling protection:', error);
    } finally {
      setIsTogglingProtection(false);
    }
  };

  const installPlugin = async () => {
    setIsInstalling(true);
    setInstallMessage('正在安装 AIGov 安全防护服务...');
    try {
      const res = await fetch('/api/protection/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setInstallMessage('安装成功！正在重新加载...');
        setTimeout(() => {
          setShowInstallModal(false);
          setInstallMessage('');
          setIsInstalling(false);
          setProtectionStatus({ isEnabled: false, isInstalled: false, status: 'loading' });
          fetchStatus();
          fetchData();
        }, 1000);
      } else {
        setInstallMessage(data.message || '安装失败，请重试');
        setIsInstalling(false);
      }
    } catch (error) {
      console.error('Error installing plugin:', error);
      setInstallMessage('安装失败，请检查网络连接');
      setIsInstalling(false);
    }
  };

  const uninstallPlugin = async () => {
    setIsUninstalling(true);
    try {
      const res = await fetch('/api/protection/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setShowUninstallModal(false);
        setIsUninstalling(false);
        fetchStatus();
      } else {
        alert(data.message || '卸载失败');
        setIsUninstalling(false);
      }
    } catch (error) {
      console.error('Error uninstalling plugin:', error);
      alert('卸载失败，请重试');
      setIsUninstalling(false);
    }
  };

  const activateTemplate = async (templateId: string) => {
    try {
      const res = await fetch('/api/protection/primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();
      if (data.success) {
        setPrimaryRules(data.primaryRules);
      }
    } catch (error) {
      console.error('Error activating template:', error);
    }
  };

  const addCustomRule = async (rule: Omit<CustomRule, 'id'>) => {
    try {
      const res = await fetch('/api/protection/custom-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
        setIsAddingRule(false);
        setEditingRule(null);
      }
    } catch (error) {
      console.error('Error adding rule:', error);
    }
  };

  const updateCustomRule = async (oldPattern: string, oldType: string, rule: CustomRule) => {
    try {
      const res = await fetch('/api/protection/custom-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPattern,
          oldType,
          newPattern: rule.pattern,
          description: rule.description,
          type: rule.type,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
        setEditingRule(null);
      }
    } catch (error) {
      console.error('Error updating rule:', error);
    }
  };

  const deleteCustomRule = async (pattern: string, type: string) => {
    try {
      const res = await fetch(`/api/protection/custom-rules?pattern=${encodeURIComponent(pattern)}&type=${type}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const filteredActivity = useMemo(() => {
    let activities = protectionStats.recentActivity;
    
    if (activityFilter !== 'all') {
      activities = activities.filter(a => a.action === activityFilter);
    }
    
    if (timeRangeFilter !== 'all') {
      const now = new Date().getTime();
      const ranges = {
        '1h': 3600000,
        '24h': 86400000,
        '7d': 604800000,
        '30d': 2592000000,
      };
      const cutoff = now - ranges[timeRangeFilter];
      activities = activities.filter(a => new Date(a.timestamp).getTime() >= cutoff);
    }
    
    if (activitySearchQuery) {
      const query = activitySearchQuery.toLowerCase();
      activities = activities.filter(a => {
        const messageMatch = a.message?.toLowerCase().includes(query);
        const ruleMatch = a.rule?.toLowerCase().includes(query);
        const toolMatch = a.toolName?.toLowerCase().includes(query);
        const inputMatch = a.data?.input?.toLowerCase().includes(query);
        return messageMatch || ruleMatch || toolMatch || inputMatch;
      });
    }
    
    return [...activities].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [protectionStats.recentActivity, activityFilter, timeRangeFilter, activitySearchQuery]);

  const filteredLogs = useMemo(() => {
    const logs = journalLogs.filter(log => {
      if (logFilter !== 'all' && log.level !== logFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return log.message.toLowerCase().includes(query) || log.raw.toLowerCase().includes(query);
      }
      return true;
    });
    
    return [...logs].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [journalLogs, logFilter, searchQuery]);

  useEffect(() => {
    if (!isLoading && !hasScrolledToBottom) {
      setTimeout(() => {
        scrollToBottom(activityContainerRef.current, false);
        scrollToBottom(logContainerRef.current, false);
        setHasScrolledToBottom(true);
      }, 100);
    }
  }, [isLoading, hasScrolledToBottom, scrollToBottom]);

  const loadMoreActivity = useCallback(() => {
    if (isLoadingMoreActivity || displayedActivityCount >= filteredActivity.length) return;
    
    const container = activityContainerRef.current;
    if (container) {
      activityScrollHeightRef.current = container.scrollHeight;
    }
    
    setIsLoadingMoreActivity(true);
    setTimeout(() => {
      setDisplayedActivityCount(prev => Math.min(prev + 10, filteredActivity.length));
      setIsLoadingMoreActivity(false);
    }, 300);
  }, [isLoadingMoreActivity, displayedActivityCount, filteredActivity.length]);

  const loadMoreLogs = useCallback(() => {
    if (isLoadingMoreLogs || displayedLogCount >= filteredLogs.length) return;
    
    const container = logContainerRef.current;
    if (container) {
      logScrollHeightRef.current = container.scrollHeight;
    }
    
    setIsLoadingMoreLogs(true);
    setTimeout(() => {
      setDisplayedLogCount(prev => Math.min(prev + 20, filteredLogs.length));
      setIsLoadingMoreLogs(false);
    }, 300);
  }, [isLoadingMoreLogs, displayedLogCount, filteredLogs.length]);

  useEffect(() => {
    if (!isLoadingMoreActivity && activityScrollHeightRef.current > 0) {
      const container = activityContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - activityScrollHeightRef.current;
        container.scrollTop = scrollDiff;
        activityScrollHeightRef.current = 0;
      }
    }
  }, [displayedActivityCount, isLoadingMoreActivity]);

  useEffect(() => {
    if (!isLoadingMoreLogs && logScrollHeightRef.current > 0) {
      const container = logContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - logScrollHeightRef.current;
        container.scrollTop = scrollDiff;
        logScrollHeightRef.current = 0;
      }
    }
  }, [displayedLogCount, isLoadingMoreLogs]);

  const handleActivityScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop < 10 && displayedActivityCount < filteredActivity.length && !isLoadingMoreActivity) {
      loadMoreActivity();
    }
  }, [displayedActivityCount, filteredActivity.length, isLoadingMoreActivity, loadMoreActivity]);

  const handleLogScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop < 10 && displayedLogCount < filteredLogs.length && !isLoadingMoreLogs) {
      loadMoreLogs();
    }
  }, [displayedLogCount, filteredLogs.length, isLoadingMoreLogs, loadMoreLogs]);

  const templateRulesCount = primaryRules 
    ? Object.keys(primaryRules.rules.block || {}).length + 
      Object.keys(primaryRules.rules.confirm || {}).length + 
      Object.keys(primaryRules.rules.warn || {}).length 
    : 0;
  const customRulesCount = customRules.length;
  const totalRules = templateRulesCount + customRulesCount;

  const isLoadingStatus = protectionStatus.status === 'loading';

  return (
    <div className="min-h-screen">
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 mb-2"
        >
          <div className="relative">
            <motion.div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-indigo-500/25"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(99, 102, 241, 0.3)',
                  '0 0 40px rgba(99, 102, 241, 0.5)',
                  '0 0 20px rgba(99, 102, 241, 0.3)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <ShieldCheck className="w-7 h-7 text-white" />
            </motion.div>
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              OpenClaw 智能防护中心
            </h1>
            <p className="text-[var(--text-secondary)] mt-1">
                AIGov-Insight 实时语义分析与动态干预防护
            </p>
          </div>
        </motion.div>
      </div>

      <div className={`flex gap-2 mb-8 p-1.5 rounded-2xl backdrop-blur-xl border w-fit transition-all duration-300 ${
        isDarkMode 
          ? 'bg-gray-800/60 border-gray-700/50' 
          : 'bg-white/80 border-gray-200/50 shadow-sm'
      }`}>
        {[
          { id: 'overview', label: '防护概览', icon: Activity },
          { id: 'templates', label: '规则模板', icon: Layers },
          { id: 'custom', label: '自定义规则', icon: Code },
          { id: 'services', label: '服务管理', icon: Settings },
        ].map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as typeof activeSection)}
            className={`relative px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeSection === tab.id
                ? 'text-white'
                : isDarkMode
                  ? 'text-gray-400 hover:text-white'
                  : 'text-gray-600 hover:text-gray-900'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {activeSection === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeSection === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              className="relative -mx-4 md:-mx-6 lg:-mx-8 overflow-hidden"
            >
              <div className="relative px-4 md:px-6 lg:px-8 py-10 md:py-14">
                <div className="max-w-6xl mx-auto">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 lg:gap-12">
                    <motion.div 
                      className="flex-1 space-y-6"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: 0.1 }}
                    >
                      <div className="flex items-center gap-4">
                        <motion.div
                          className={`relative flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                            isLoadingStatus
                              ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
                              : protectionStatus.isEnabled
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                                : protectionStatus.status === 'not_installed'
                                  ? 'bg-gradient-to-br from-orange-500 to-amber-600'
                                  : isDarkMode 
                                    ? 'bg-gradient-to-br from-gray-600 to-gray-700'
                                    : 'bg-gradient-to-br from-gray-300 to-gray-400'
                          }`}
                          animate={{
                            boxShadow: isLoadingStatus
                              ? ['0 8px 32px rgba(99, 102, 241, 0.25)', '0 8px 48px rgba(99, 102, 241, 0.4)', '0 8px 32px rgba(99, 102, 241, 0.25)']
                              : protectionStatus.isEnabled
                                ? ['0 8px 32px rgba(16, 185, 129, 0.25)', '0 8px 48px rgba(16, 185, 129, 0.4)', '0 8px 32px rgba(16, 185, 129, 0.25)']
                                : protectionStatus.status === 'not_installed'
                                  ? ['0 8px 32px rgba(249, 115, 22, 0.2)', '0 8px 40px rgba(249, 115, 22, 0.35)', '0 8px 32px rgba(249, 115, 22, 0.2)']
                                  : '0 4px 16px rgba(0, 0, 0, 0.1)',
                          }}
                          transition={{
                            boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                          }}
                        >
                          <AnimatePresence mode="wait">
                            {isLoadingStatus ? (
                              <motion.div
                                key="loading"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.3 }}
                              >
                                <motion.div
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                >
                                  <Loader2 className="w-8 h-8 md:w-9 md:h-9 text-white" />
                                </motion.div>
                              </motion.div>
                            ) : protectionStatus.status === 'not_installed' ? (
                              <motion.div
                                key="notfound"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.3 }}
                              >
                                <Package className="w-8 h-8 md:w-9 md:h-9 text-white/90" />
                              </motion.div>
                            ) : protectionStatus.isEnabled ? (
                              <motion.div
                                key="protected"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.3 }}
                              >
                                <ShieldCheck className="w-8 h-8 md:w-9 md:h-9 text-white" />
                              </motion.div>
                            ) : (
                              <motion.div
                                key="unprotected"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.3 }}
                              >
                                <ShieldOff className="w-8 h-8 md:w-9 md:h-9 text-white/80" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <motion.div
                              className={`w-2 h-2 rounded-full ${
                                isLoadingStatus
                                  ? 'bg-blue-500'
                                  : protectionStatus.isEnabled
                                    ? 'bg-emerald-500'
                                    : protectionStatus.status === 'not_installed'
                                      ? 'bg-orange-500'
                                      : isDarkMode ? 'bg-gray-500' : 'bg-gray-400'
                              }`}
                              animate={{
                                scale: [1, 1.2, 1],
                                opacity: [1, 0.7, 1],
                              }}
                              transition={{ duration: 2, repeat: Infinity }}
                            />
                            <span className={`text-sm font-medium ${
                              isLoadingStatus
                                ? 'text-blue-500'
                                : protectionStatus.isEnabled
                                  ? 'text-emerald-500'
                                  : protectionStatus.status === 'not_installed'
                                    ? 'text-orange-500'
                                    : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {isLoadingStatus
                                ? '正在连接服务'
                                : protectionStatus.status === 'not_installed'
                                  ? '服务未安装'
                                  : protectionStatus.isEnabled
                                    ? '实时防护中'
                                    : '防护已关闭'
                              }
                            </span>
                          </div>
                          <h2 className="text-2xl md:text-3xl font-bold text-[var(--foreground)] tracking-tight">
                            {isLoadingStatus 
                              ? '正在查询防护状态' 
                              : protectionStatus.status === 'not_installed'
                                ? 'AIGov 防护服务'
                                : protectionStatus.isEnabled 
                                  ? '防护已开启' 
                                  : '防护已关闭'
                            }
                          </h2>
                        </div>
                      </div>

                      <motion.p
                        className="text-base md:text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                      >
                        {isLoadingStatus
                          ? '请稍候，正在连接 OpenClaw 服务...'
                          : protectionStatus.status === 'not_installed'
                            ? '安装 AIGov 安全防护服务，为您的 AI 交互提供全方位保护'
                            : protectionStatus.isEnabled
                              ? `AIGov-Insight 持续守护 🦞 OpenClaw 安全`
                              : '开启智能防护，让 AIGov-Insight 为您的 AI 交互保驾护航'
                        }
                      </motion.p>

                      {protectionStatus.isEnabled && !isLoadingStatus && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3, duration: 0.4 }}
                          className="flex flex-wrap items-center gap-3"
                        >
                          
                          {protectionStatus.openclawVersion && (
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                              isDarkMode ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'
                            }`}>
                              <Server className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                OpenClaw {protectionStatus.openclawVersion}
                              </span>
                            </div>
                          )}
                          {protectionStatus.gatewayPort && (
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                              isDarkMode ? 'bg-cyan-500/10 border border-cyan-500/20' : 'bg-cyan-50 border border-cyan-200'
                            }`}>
                              <Globe className="w-3.5 h-3.5 text-cyan-500" />
                              <span className="text-sm text-cyan-600 dark:text-cyan-400 font-medium">
                                端口 {protectionStatus.gatewayPort}
                              </span>
                            </div>
                          )}
                          {protectionStatus.version && (
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                              isDarkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'
                            }`}>
                              <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">v{protectionStatus.version}</span>
                            </div>
                          )}
                          {primaryRules && (
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                              isDarkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'
                            }`}>
                              <div className="w-3.5 h-3.5 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                                {primaryRules.source ? templateIcons[primaryRules.source] : <Shield className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                预置规则 {primaryRules.source ? (primaryRules.source) : '规则库'} {templateRulesCount} 条
                              </span>
                            </div>
                          )}
                          {customRules.length > 0 && (
                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                              isDarkMode ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'
                            }`}>
                              <Code className="w-3.5 h-3.5 text-purple-500" />
                              <span className="text-sm text-purple-600 dark:text-purple-400 font-medium">
                                自定义规则 {customRules.length} 条
                              </span>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>

                    <motion.div
                      className="flex-shrink-0"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: 0.2 }}
                    >
                      {protectionStatus.status === 'not_installed' ? (
                        <motion.button
                          onClick={() => {
                            setInstallMessage('');
                            setIsInstalling(false);
                            setShowInstallModal(true);
                          }}
                          className={`group relative inline-flex items-center gap-3 px-6 py-3.5 rounded-xl font-medium text-base transition-all duration-300 ${
                            isDarkMode 
                              ? 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20'
                              : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25'
                          }`}
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <motion.div
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/15 to-white/0"
                            initial={{ x: '-100%' }}
                            whileHover={{ x: '100%' }}
                            transition={{ duration: 0.5 }}
                          />
                          <Download className="w-5 h-5 relative z-10" />
                          <span className="relative z-10">安装防护服务</span>
                        </motion.button>
                      ) : (
                        <div className={`p-4 rounded-2xl backdrop-blur-sm border transition-colors duration-300 ${
                          isDarkMode 
                            ? 'bg-gray-800/50 border-gray-700/50' 
                            : 'bg-white/80 border-gray-200/50 shadow-sm'
                        }`}>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <div className={`text-xs font-medium mb-1 ${
                                protectionStatus.isEnabled ? 'text-emerald-500' : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                                {protectionStatus.isEnabled ? '已开启' : '已关闭'}
                              </div>
                              <motion.button
                                onClick={toggleProtection}
                                disabled={isTogglingProtection || isLoadingStatus}
                                className={`relative w-16 h-9 rounded-full transition-all duration-300 ${
                                  isLoadingStatus
                                    ? 'bg-blue-500'
                                    : protectionStatus.isEnabled
                                      ? 'bg-emerald-500'
                                      : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                                } ${(isTogglingProtection || isLoadingStatus) ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                                whileHover={{ scale: (isTogglingProtection || isLoadingStatus) ? 1 : 1.05 }}
                                whileTap={{ scale: (isTogglingProtection || isLoadingStatus) ? 1 : 0.95 }}
                              >
                                <motion.div
                                  className={`absolute top-1 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center ${
                                    (isLoadingStatus || protectionStatus.isEnabled) ? 'right-1' : 'left-1'
                                  }`}
                                  transition={{ duration: 0.2, ease: 'easeOut' }}
                                >
                                  {isTogglingProtection || isLoadingStatus ? (
                                    <motion.div
                                      animate={{ rotate: 360 }}
                                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    >
                                      <Loader2 className="w-4 h-4 text-blue-500" />
                                    </motion.div>
                                  ) : protectionStatus.isEnabled ? (
                                    <Power className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <Power className="w-4 h-4 text-gray-400" />
                                  )}
                                </motion.div>
                              </motion.button>
                            </div>
                            <div className={`h-10 w-px ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />
                            <div className="text-center">
                              <div className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                防护开关
                              </div>
                              <div className={`text-sm font-semibold text-[var(--foreground)]`}>
                                {protectionStatus.isEnabled ? '运行中' : '已停止'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <GlassCard className="overflow-hidden" delay={0}>
                <div className="p-6 border-b border-[var(--border-color)]/30">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <TrendingUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-[var(--foreground)]">防护态势总览</h3>
                        <p className="text-xs text-[var(--text-secondary)]">规则统计 · 防护数据 · 实时活动</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-secondary)]">
                        共 {totalRules} 条规则
                      </span>
                    </div>
                  </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      规则分布
                    </span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      共 {totalRules} 条
                    </span>
                  </div>
                  <CombinedRuleDistributionBar
                    templateBlock={primaryRules ? Object.keys(primaryRules.rules.block || {}).length : 0}
                    templateConfirm={primaryRules ? Object.keys(primaryRules.rules.confirm || {}).length : 0}
                    templateWarn={primaryRules ? Object.keys(primaryRules.rules.warn || {}).length : 0}
                    customBlock={customRules.filter(r => r.type === 'block').length}
                    customConfirm={customRules.filter(r => r.type === 'confirm').length}
                    customWarn={customRules.filter(r => r.type === 'warn').length}
                    isDarkMode={isDarkMode}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <motion.div 
                    className={`relative overflow-hidden rounded-2xl p-4 ${
                      isDarkMode ? 'bg-gradient-to-br from-red-500/10 to-rose-500/5' : 'bg-gradient-to-br from-red-50 to-rose-50'
                    } border ${isDarkMode ? 'border-red-500/20' : 'border-red-100'}`}
                    whileHover={{ scale: 1.02, y: -2 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/5 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.6 }}
                    />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                        <ShieldX className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--foreground)]">{protectionStats.block}</div>
                        <div className="text-xs text-red-500 font-medium">已拦截</div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div 
                    className={`relative overflow-hidden rounded-2xl p-4 ${
                      isDarkMode ? 'bg-gradient-to-br from-amber-500/10 to-orange-500/5' : 'bg-gradient-to-br from-amber-50 to-orange-50'
                    } border ${isDarkMode ? 'border-amber-500/20' : 'border-amber-100'}`}
                    whileHover={{ scale: 1.02, y: -2 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.6 }}
                    />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <ShieldQuestion className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--foreground)]">{protectionStats.confirmRequired}</div>
                        <div className="text-xs text-amber-500 font-medium">待确认</div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div 
                    className={`relative overflow-hidden rounded-2xl p-4 ${
                      isDarkMode ? 'bg-gradient-to-br from-orange-500/10 to-amber-500/5' : 'bg-gradient-to-br from-orange-50 to-amber-50'
                    } border ${isDarkMode ? 'border-orange-500/20' : 'border-orange-100'}`}
                    whileHover={{ scale: 1.02, y: -2 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/5 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.6 }}
                    />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--foreground)]">{protectionStats.confirm}</div>
                        <div className="text-xs text-orange-500 font-medium">已确认</div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div 
                    className={`relative overflow-hidden rounded-2xl p-4 ${
                      isDarkMode ? 'bg-gradient-to-br from-yellow-500/10 to-amber-500/5' : 'bg-gradient-to-br from-yellow-50 to-amber-50'
                    } border ${isDarkMode ? 'border-yellow-500/20' : 'border-yellow-100'}`}
                    whileHover={{ scale: 1.02, y: -2 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-500/5 to-transparent"
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.6 }}
                    />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                        <AlertTriangle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-[var(--foreground)]">{protectionStats.warn}</div>
                        <div className="text-xs text-yellow-600 font-medium">已告警</div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </div>

              <div className="p-5 border-b border-[var(--border-color)]/30">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Activity className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[var(--foreground)]">最近防护活动</h4>
                        <p className="text-xs text-[var(--text-secondary)]">实时安全事件记录</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className={`text-xs text-[var(--text-secondary)] px-2 py-1 rounded-lg ${isDarkMode ? 'bg-transparent' : 'bg-gray-100/80'}`}>
                        {filteredActivity.length} 条记录
                      </span>
                      <motion.button
                        onClick={() => {
                          fetchJournalLogs();
                          setDisplayedActivityCount(10);
                        }}
                        className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <RefreshCw className={`w-4 h-4 text-[var(--text-secondary)] ${isLoading ? 'animate-spin' : ''}`} />
                      </motion.button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                      <input
                        type="text"
                        placeholder="搜索事件、规则、工具..."
                        value={activitySearchQuery}
                        onChange={(e) => {
                          setActivitySearchQuery(e.target.value);
                          setDisplayedActivityCount(10);
                        }}
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600/50'
                            : 'bg-gray-50 border-gray-200'
                        } border text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all`}
                      />
                      {activitySearchQuery && (
                        <button
                          onClick={() => {
                            setActivitySearchQuery('');
                            setDisplayedActivityCount(10);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        >
                          <X className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                        </button>
                      )}
                    </div>
                    
                    <motion.button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        showAdvancedFilters || timeRangeFilter !== 'all'
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                          : isDarkMode
                            ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-700 border border-gray-600/50'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Filter className="w-4 h-4" />
                      高级过滤
                      {(showAdvancedFilters || timeRangeFilter !== 'all') && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                    </motion.button>
                  </div>
                  
                  <AnimatePresence>
                    {showAdvancedFilters && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'} border ${isDarkMode ? 'border-gray-600/30' : 'border-gray-200'}`}>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">事件类型</label>
                              <div className="flex flex-wrap gap-1.5">
                                {(['all', 'block', 'confirm_required', 'confirm', 'warn', 'allow'] as const).map((filter) => {
                                  const config = filter === 'all' ? null : actionConfig[filter];
                                  return (
                                    <button
                                      key={filter}
                                      onClick={() => {
                                        setActivityFilter(filter);
                                        setDisplayedActivityCount(10);
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                        activityFilter === filter
                                          ? filter === 'all' 
                                            ? 'bg-blue-500 text-white shadow-sm' 
                                            : `bg-gradient-to-r ${config?.gradient} text-white shadow-sm`
                                          : isDarkMode
                                            ? 'bg-gray-600/50 text-gray-300 hover:bg-gray-600'
                                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                      }`}
                                    >
                                      {filter === 'all' ? '全部类型' : config?.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            
                            <div>
                              <label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">时间范围</label>
                              <div className="flex flex-wrap gap-1.5">
                                {[
                                  { value: 'all', label: '全部时间' },
                                  { value: '1h', label: '最近1小时' },
                                  { value: '24h', label: '最近24小时' },
                                  { value: '7d', label: '最近7天' },
                                  { value: '30d', label: '最近30天' },
                                ].map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => {
                                      setTimeRangeFilter(option.value as typeof timeRangeFilter);
                                      setDisplayedActivityCount(10);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                      timeRangeFilter === option.value
                                        ? 'bg-blue-500 text-white shadow-sm'
                                        : isDarkMode
                                          ? 'bg-gray-600/50 text-gray-300 hover:bg-gray-600'
                                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          {(activityFilter !== 'all' || timeRangeFilter !== 'all' || activitySearchQuery) && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600/50">
                              <button
                                onClick={() => {
                                  setActivityFilter('all');
                                  setTimeRangeFilter('all');
                                  setActivitySearchQuery('');
                                  setDisplayedActivityCount(10);
                                }}
                                className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                              >
                                <X className="w-3 h-3" />
                                清除所有过滤条件
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className={`flex gap-1.5 p-1.5 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-100/50'} overflow-x-auto`}>
                    {(['all', 'block', 'confirm_required', 'confirm', 'warn'] as const).map((filter) => {
                      const config = filter === 'all' ? null : actionConfig[filter];
                      return (
                        <button
                          key={filter}
                          onClick={() => {
                            setActivityFilter(filter);
                            setDisplayedActivityCount(10);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                            activityFilter === filter
                              ? filter === 'all' 
                                ? 'bg-blue-500 text-white shadow-sm' 
                                : `bg-gradient-to-r ${config?.gradient} text-white shadow-sm`
                              : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {filter === 'all' ? '全部' : config?.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div 
                ref={activityContainerRef}
                onScroll={handleActivityScroll}
                className="max-h-96 overflow-y-auto"
              >
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <ActivityCardSkeleton key={i} isDarkMode={isDarkMode} />
                    ))}
                  </div>
                ) : filteredActivity.length === 0 ? (
                  <EmptyState
                    icon={activitySearchQuery || activityFilter !== 'all' || timeRangeFilter !== 'all' ? Search : Activity}
                    title={activitySearchQuery || activityFilter !== 'all' || timeRangeFilter !== 'all' ? '未找到匹配记录' : '暂无防护活动'}
                    description={activitySearchQuery || activityFilter !== 'all' || timeRangeFilter !== 'all' ? '尝试调整搜索条件或过滤选项' : '系统运行正常，暂无安全事件记录'}
                    isDarkMode={isDarkMode}
                    action={
                      (activitySearchQuery || activityFilter !== 'all' || timeRangeFilter !== 'all') && (
                        <motion.button
                          onClick={() => {
                            setActivityFilter('all');
                            setTimeRangeFilter('all');
                            setActivitySearchQuery('');
                            setDisplayedActivityCount(10);
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-blue-500/25"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <RefreshCw className="w-4 h-4" />
                          清除过滤条件
                        </motion.button>
                      )
                    }
                  />
                ) : (
                  <div className="p-4 space-y-3">
                    {displayedActivityCount < filteredActivity.length && (
                      <motion.button
                        onClick={loadMoreActivity}
                        disabled={isLoadingMoreActivity}
                        className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all ${
                          isDarkMode 
                            ? 'bg-gray-700/50 hover:bg-gray-700 text-gray-300' 
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        } ${isLoadingMoreActivity ? 'opacity-50 cursor-not-allowed' : ''}`}
                        whileHover={{ scale: isLoadingMoreActivity ? 1 : 1.01 }}
                        whileTap={{ scale: isLoadingMoreActivity ? 1 : 0.99 }}
                      >
                        {isLoadingMoreActivity ? (
                          <span className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            加载中...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <ChevronUp className="w-4 h-4" />
                            加载更多 ({filteredActivity.length - displayedActivityCount} 条)
                          </span>
                        )}
                      </motion.button>
                    )}
                    {filteredActivity.slice(0, displayedActivityCount).map((activity, index) => (
                      <ActivityCard 
                        key={`${activity.timestamp}-${index}`} 
                        activity={activity} 
                        index={index}
                        isDarkMode={isDarkMode}
                      />
                    ))}
                  </div>
                )}
              </div>
              </GlassCard>
            </motion.div>

            <GlassCard className="overflow-hidden" delay={0.4}>
              <div className="p-5 border-b border-[var(--border-color)]/30">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center`}>
                      <Terminal className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-[var(--foreground)]">系统运行日志</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-[var(--text-secondary)]">OpenClaw 安全网关运行日志</p>
                        <span className="text-xs text-[var(--text-secondary)]">·</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-medium">{logStats.error} 错误</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-medium">{logStats.warn} 警告</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-medium">{logStats.info} 信息</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                      <input
                        type="text"
                        placeholder="搜索日志..."
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setDisplayedLogCount(20);
                        }}
                        className={`pl-9 pr-4 py-2 rounded-xl text-sm ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600'
                            : 'bg-gray-100 border-gray-200'
                        } border text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-40 transition-all focus:w-52`}
                      />
                    </div>
                    
                    <div className={`flex gap-1 p-1 rounded-xl ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'} overflow-x-auto max-w-full`}>
                      {(['all', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((filter) => {
                        const config = filter === 'all' ? null : logLevelConfig[filter];
                        return (
                          <button
                            key={filter}
                            onClick={() => {
                              setLogFilter(filter);
                              setDisplayedLogCount(20);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
                              logFilter === filter
                                ? filter === 'all' 
                                  ? 'bg-blue-500 text-white shadow-sm' 
                                  : `${config?.bgColor} ${config?.textColor}`
                                : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            {filter === 'all' ? '全部' : config?.label}
                          </button>
                        );
                      })}
                    </div>

                    <motion.button
                      onClick={() => {
                        fetchJournalLogs();
                        setDisplayedLogCount(20);
                      }}
                      className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <RefreshCw className={`w-4 h-4 text-[var(--text-secondary)] ${isLoading ? 'animate-spin' : ''}`} />
                    </motion.button>
                  </div>
                </div>
              </div>
              
              <div className="relative">
                <div 
                  ref={logContainerRef}
                  onScroll={handleLogScroll}
                  className="h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
                >
                  {isLoading ? (
                    <div>
                      {[...Array(8)].map((_, i) => (
                        <LogItemSkeleton key={i} isDarkMode={isDarkMode} />
                      ))}
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <EmptyState
                      icon={searchQuery || logFilter !== 'all' ? Search : FileText}
                      title={searchQuery || logFilter !== 'all' ? '未找到匹配日志' : '暂无系统日志'}
                      description={searchQuery || logFilter !== 'all' ? '尝试调整搜索关键词或日志级别' : '系统运行正常，暂无日志记录'}
                      isDarkMode={isDarkMode}
                      action={
                        (searchQuery || logFilter !== 'all') && (
                          <motion.button
                            onClick={() => {
                              setLogFilter('all');
                              setSearchQuery('');
                              setDisplayedLogCount(20);
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium shadow-lg shadow-blue-500/25"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <RefreshCw className="w-4 h-4" />
                            清除过滤条件
                          </motion.button>
                        )
                      }
                    />
                  ) : (
                    <div>
                      {displayedLogCount < filteredLogs.length && (
                        <motion.button
                          onClick={loadMoreLogs}
                          disabled={isLoadingMoreLogs}
                          className={`w-full py-2.5 text-sm font-medium transition-all border-b ${
                            isDarkMode 
                              ? 'bg-gray-800/50 hover:bg-gray-800 text-gray-300 border-gray-700/30' 
                              : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200'
                          } ${isLoadingMoreLogs ? 'opacity-50 cursor-not-allowed' : ''}`}
                          whileHover={{ scale: isLoadingMoreLogs ? 1 : 1.01 }}
                          whileTap={{ scale: isLoadingMoreLogs ? 1 : 0.99 }}
                        >
                          {isLoadingMoreLogs ? (
                            <span className="flex items-center justify-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              加载中...
                            </span>
                          ) : (
                            <span className="flex items-center justify-center gap-2">
                              <ChevronUp className="w-4 h-4" />
                              加载更多 ({filteredLogs.length - displayedLogCount} 条)
                            </span>
                          )}
                        </motion.button>
                      )}
                      {filteredLogs.slice(0, displayedLogCount).map((log, index) => (
                        <LogItem key={log.id} log={log} index={index} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {activeSection === 'templates' && (
          <motion.div
            key="templates"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)]">规则模板库</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  选择预置模板快速启用安全防护规则
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-secondary)]">
                  共 {templates.length} 个模板
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template, index) => {
                const isSelected = primaryRules?.source === template.id;
                return (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`relative rounded-2xl overflow-hidden ${
                    isDarkMode ? 'bg-gray-800/30' : 'bg-white/50'
                  } backdrop-blur-xl border ${
                    isSelected
                      ? isDarkMode 
                        ? 'border-blue-400/60' 
                        : 'border-blue-500/70'
                      : isDarkMode
                        ? 'border-white/10'
                        : 'border-white/50'
                  } shadow-xl transition-all duration-500`}
                  style={isSelected ? {
                    boxShadow: isDarkMode 
                      ? '0 0 40px -10px rgba(59, 130, 246, 0.4), 0 0 80px -20px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                      : '0 0 40px -10px rgba(59, 130, 246, 0.3), 0 0 80px -20px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255,255,255,0.8)',
                  } : {}}
                >
                  {isSelected && (
                    <>
                      <motion.div
                        className="absolute inset-0 pointer-events-none overflow-hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                      >
                        <motion.div
                          className="absolute inset-0"
                          initial={{ x: '-100%' }}
                          animate={{ x: '200%' }}
                          transition={{
                            duration: 3,
                            ease: 'easeInOut',
                            repeat: Infinity,
                            repeatDelay: 2,
                          }}
                          style={{
                            backgroundImage: isDarkMode
                              ? 'linear-gradient(105deg, transparent 0%, transparent 35%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 55%, transparent 65%, transparent 100%)'
                              : 'linear-gradient(105deg, transparent 0%, transparent 35%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.5) 55%, transparent 65%, transparent 100%)',
                            backgroundRepeat: 'no-repeat',
                            width: '50%',
                          }}
                        />
                      </motion.div>
                      <motion.div
                        className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.3) 20%, rgba(99,102,241,0.5) 50%, rgba(139,92,246,0.3) 80%, transparent 100%)',
                        }}
                      >
                        <motion.div
                          className="absolute inset-0"
                          initial={{ x: '-100%' }}
                          animate={{ x: '200%' }}
                          transition={{
                            duration: 2.5,
                            ease: 'easeInOut',
                            repeat: Infinity,
                            repeatDelay: 1,
                          }}
                          style={{
                            backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)',
                            backgroundRepeat: 'no-repeat',
                            width: '40%',
                          }}
                        />
                      </motion.div>
                      <motion.div
                        className="absolute top-[3px] left-0 right-0 h-[2px]"
                        style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.6) 30%, rgba(99,102,241,0.8) 50%, rgba(139,92,246,0.6) 70%, transparent 100%)',
                          boxShadow: isDarkMode 
                            ? '0 0 15px 2px rgba(99,102,241,0.4)' 
                            : '0 0 20px 3px rgba(99,102,241,0.3)',
                        }}
                      />
                      <motion.div
                        className="absolute bottom-0 left-0 right-0 h-[1px]"
                        style={{
                          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(139,92,246,0.5), transparent)',
                        }}
                      />
                      <motion.div
                        className="absolute top-0 bottom-0 left-0 w-[1px]"
                        style={{
                          background: 'linear-gradient(180deg, transparent, rgba(59,130,246,0.5), rgba(99,102,241,0.4), transparent)',
                        }}
                      />
                      <motion.div
                        className="absolute top-0 bottom-0 right-0 w-[1px]"
                        style={{
                          background: 'linear-gradient(180deg, transparent, rgba(139,92,246,0.5), rgba(99,102,241,0.4), transparent)',
                        }}
                      />
                    </>
                  )}
                  <div className="relative p-5">
                    <div className="flex items-start justify-between mb-4">
                      <motion.div 
                        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${templateGradients[template.id] || 'from-gray-400 to-gray-500'} flex items-center justify-center text-white shadow-lg`}
                        animate={isSelected ? {
                          boxShadow: [
                            '0 4px 20px -5px rgba(59, 130, 246, 0.3)',
                            '0 4px 30px -5px rgba(99, 102, 241, 0.5)',
                            '0 4px 20px -5px rgba(59, 130, 246, 0.3)',
                          ],
                        } : {}}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        {templateIcons[template.id] || <Shield className="w-5 h-5" />}
                      </motion.div>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full overflow-hidden"
                          style={{
                            background: isDarkMode 
                              ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.1), rgba(139,92,246,0.15))'
                              : 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(99,102,241,0.08), rgba(139,92,246,0.1))',
                            boxShadow: isDarkMode
                              ? '0 0 20px -5px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                              : '0 0 20px -5px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.5)',
                            border: isDarkMode 
                              ? '1px solid rgba(59,130,246,0.2)'
                              : '1px solid rgba(59,130,246,0.15)',
                          }}
                        >
                          <motion.div
                            className="absolute inset-0"
                            initial={{ x: '-100%' }}
                            animate={{ x: '200%' }}
                            transition={{
                              duration: 2,
                              ease: 'easeInOut',
                              repeat: Infinity,
                              repeatDelay: 3,
                            }}
                            style={{
                              backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                              backgroundRepeat: 'no-repeat',
                              width: '50%',
                            }}
                          />
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <Check className="w-3.5 h-3.5 text-blue-500" strokeWidth={2.5} />
                          </motion.div>
                          <span className="relative text-xs font-semibold bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
                            已启用
                          </span>
                        </motion.div>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">{template.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-2">{template.description}</p>
                    <div className="flex items-center gap-3 mb-4">
                      {(['block', 'confirm', 'warn'] as const).map((type) => (
                        <div key={type} className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${ruleTypeConfig[type].color}`} />
                          <span className="text-xs text-[var(--text-secondary)]">
                            {template.stats[`${type}Count` as keyof typeof template.stats]}
                          </span>
                        </div>
                      ))}
                      <span className="text-xs text-[var(--text-secondary)] ml-auto">
                        共 {template.stats.totalRules} 条
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                          isDarkMode
                            ? 'bg-gray-700/50 hover:bg-gray-700'
                            : 'bg-gray-100 hover:bg-gray-200'
                        } text-[var(--foreground)] transition-colors flex items-center justify-center gap-2`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Eye className="w-4 h-4" />
                        查看规则
                      </motion.button>
                      {primaryRules?.source !== template.id && (
                        <motion.button
                          onClick={() => activateTemplate(template.id)}
                          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Zap className="w-4 h-4" />
                          启用
                        </motion.button>
                      )}
                    </div>
                  </div>
                  <AnimatePresence>
                    {expandedTemplate === template.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="border-t border-[var(--border-color)]/30 overflow-hidden"
                      >
                        <div className="p-5 max-h-80 overflow-y-auto">
                          {(['block', 'confirm', 'warn'] as const).map((type) => {
                            const rules = template.rules[type];
                            if (Object.keys(rules).length === 0) return null;
                            return (
                              <div key={type} className="mb-4 last:mb-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <RuleTypeIcon type={type} className={`w-4 h-4 ${ruleTypeConfig[type].textColor}`} />
                                  <span className={`text-sm font-medium ${ruleTypeConfig[type].textColor}`}>
                                    {ruleTypeConfig[type].label}
                                  </span>
                                  <span className="text-xs text-[var(--text-secondary)]">
                                    ({Object.keys(rules).length})
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  {Object.entries(rules).map(([pattern, description]) => (
                                    <div
                                      key={pattern}
                                      className={`p-3 rounded-xl ${ruleTypeConfig[type].bgColor} border ${ruleTypeConfig[type].borderColor}`}
                                    >
                                      <p className="text-sm text-[var(--foreground)] mb-1">{description}</p>
                                      <code className="text-xs text-[var(--text-secondary)] font-mono break-all">
                                        {pattern}
                                      </code>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeSection === 'custom' && (
          <motion.div
            key="custom"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--foreground)] tracking-tight">自定义规则</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1.5">
                  创建和管理您自己的安全防护规则
                </p>
              </div>
              <motion.button
                onClick={() => {
                  setIsAddingRule(true);
                  setEditingRule({
                    id: `new-${Date.now()}`,
                    pattern: '',
                    description: '',
                    type: 'warn',
                  });
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--foreground)] text-[var(--background)] font-medium text-sm shadow-lg shadow-black/5 dark:shadow-white/5 hover:shadow-xl hover:shadow-black/10 dark:hover:shadow-white/10 transition-all"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus className="w-4 h-4" />
                添加规则
              </motion.button>
            </div>

            <AnimatePresence>
              {editingRule && isAddingRule && (
                <motion.div
                  initial={{ opacity: 0, y: -20, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -20, height: 0 }}
                  className={`rounded-3xl overflow-hidden ${
                    isDarkMode ? 'bg-gray-800/60' : 'bg-white/80'
                  } backdrop-blur-2xl border ${
                    isDarkMode ? 'border-white/10' : 'border-gray-200/50'
                  } shadow-2xl`}
                >
                  <div className="p-8 space-y-6">
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                        isDarkMode 
                          ? 'bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/20' 
                          : 'bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200'
                      }`}
                    >
                      <motion.div
                        animate={{ rotate: [0, 0, 360, 360] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      >
                        <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                      </motion.div>
                      <div>
                        <p className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                          智能规则生成
                        </p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          已从会话分析中自动提取关键字段，请确认后添加
                        </p>
                      </div>
                    </motion.div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
                          匹配模式
                        </label>
                        <div className="relative">
                          <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                          <input
                            type="text"
                            value={editingRule.pattern}
                            onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                            placeholder="输入匹配模式或命令..."
                            className={`w-full pl-12 pr-4 py-3.5 rounded-2xl ${
                              isDarkMode
                                ? 'bg-gray-700/50 border-gray-600/50'
                                : 'bg-gray-50/80 border-gray-200/50'
                            } border text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono text-sm`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
                          规则类型
                        </label>
                        <div className="flex gap-3">
                          {(['block', 'confirm', 'warn'] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => setEditingRule({ ...editingRule, type })}
                              className={`flex-1 px-4 py-3.5 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                editingRule.type === type
                                  ? `${ruleTypeConfig[type].bgColor} ${ruleTypeConfig[type].textColor} ring-2 ring-current/20`
                                  : isDarkMode
                                    ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                                    : 'bg-gray-50/80 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <RuleTypeIcon type={type} className="w-4 h-4" />
                              {ruleTypeConfig[type].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--foreground)] mb-3">
                        规则描述
                      </label>
                      <input
                        type="text"
                        value={editingRule.description}
                        onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                        placeholder="描述这条规则的作用..."
                        className={`w-full px-4 py-3.5 rounded-2xl ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600/50'
                            : 'bg-gray-50/80 border-gray-200/50'
                        } border text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                      />
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-6 border-t border-[var(--border-color)]/20">
                      <motion.button
                        onClick={() => {
                          setEditingRule(null);
                          setIsAddingRule(false);
                        }}
                        className="px-6 py-2.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors text-sm font-medium"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        取消
                      </motion.button>
                      <motion.button
                        onClick={() => {
                          if (isAddingRule) {
                            addCustomRule(editingRule);
                          } else {
                            updateCustomRule(
                              editingRule.originalPattern || editingRule.pattern,
                              editingRule.originalType || editingRule.type,
                              editingRule
                            );
                          }
                        }}
                        disabled={!editingRule.pattern || !editingRule.description}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--foreground)] text-[var(--background)] font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        whileHover={{ scale: editingRule.pattern && editingRule.description ? 1.02 : 1 }}
                        whileTap={{ scale: editingRule.pattern && editingRule.description ? 0.98 : 1 }}
                      >
                        <Check className="w-4 h-4" />
                        {isAddingRule ? '添加规则' : '保存修改'}
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {customRules.length === 0 && !editingRule ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`rounded-3xl p-16 text-center ${
                  isDarkMode ? 'bg-gray-800/30' : 'bg-white/50'
                } backdrop-blur-2xl border ${
                  isDarkMode ? 'border-white/5' : 'border-gray-200/30'
                } shadow-xl`}
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                  <Code className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-xl font-semibold text-[var(--foreground)] mb-3 tracking-tight">暂无自定义规则</h3>
                <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto leading-relaxed">
                  点击上方按钮创建您的第一条自定义安全规则，支持精确匹配和正则表达式
                </p>
                <motion.button
                  onClick={() => {
                    setIsAddingRule(true);
                    setEditingRule({
                      id: `new-${Date.now()}`,
                      pattern: '',
                      description: '',
                      type: 'warn',
                    });
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--foreground)] text-[var(--background)] font-medium text-sm shadow-lg shadow-black/5"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="w-5 h-5" />
                  创建第一条规则
                </motion.button>
              </motion.div>
            ) : (
              <div className="space-y-8">
                {(['block', 'confirm', 'warn'] as const).map((ruleType) => {
                  const rulesOfType = customRules.filter(r => r.type === ruleType);
                  const config = ruleTypeConfig[ruleType];
                  
                  return (
                    <motion.div
                      key={ruleType}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: ruleType === 'block' ? 0 : ruleType === 'confirm' ? 0.1 : 0.2 }}
                      className={`rounded-3xl overflow-hidden ${
                        isDarkMode ? 'bg-gray-800/30' : 'bg-white/50'
                      } backdrop-blur-2xl border ${
                        isDarkMode ? 'border-white/5' : 'border-gray-200/30'
                      } shadow-xl`}
                    >
                      <div className={`px-6 py-5 border-b ${
                        isDarkMode ? 'border-white/5' : 'border-gray-200/30'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg`}>
                              <config.Icon className="w-6 h-6 text-white" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-[var(--foreground)] tracking-tight">{config.label}规则</h3>
                              <p className="text-sm text-[var(--text-secondary)] mt-0.5">{config.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${config.bgColor} ${config.textColor}`}>
                              {rulesOfType.length} 条
                            </span>
                            <motion.button
                              onClick={() => {
                                setIsAddingRule(true);
                                setEditingRule({
                                  id: `new-${Date.now()}`,
                                  pattern: '',
                                  description: '',
                                  type: ruleType,
                                });
                              }}
                              className={`p-2 rounded-xl ${config.bgColor} ${config.textColor} hover:opacity-80 transition-opacity`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Plus className="w-4 h-4" />
                            </motion.button>
                          </div>
                        </div>
                      </div>
                      
                      {rulesOfType.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                          <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl ${config.bgColor} flex items-center justify-center`}>
                            <config.Icon className={`w-8 h-8 ${config.textColor} opacity-50`} />
                          </div>
                          <p className="text-[var(--text-secondary)] text-sm">
                            暂无{config.label}规则
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[var(--border-color)]/10">
                          {rulesOfType.map((rule, index) => (
                            <div key={rule.id}>
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className={`px-6 py-5 group ${
                                  editingRule && !isAddingRule && editingRule.originalPattern === rule.pattern
                                    ? 'bg-blue-500/5'
                                    : ''
                                } hover:bg-gray-500/5 transition-colors duration-200`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-4 flex-1 min-w-0">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-[var(--foreground)] font-medium mb-2">{rule.description}</p>
                                      <code className={`inline-flex items-center text-xs px-3 py-1.5 rounded-lg ${
                                        isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100/80'
                                      } text-[var(--text-secondary)] font-mono`}>
                                        {rule.pattern}
                                      </code>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <motion.button
                                      onClick={() => {
                                        setIsAddingRule(false);
                                        setEditingRule({
                                          ...rule,
                                          originalPattern: rule.pattern,
                                          originalType: rule.type,
                                        });
                                      }}
                                      className={`p-2 rounded-xl ${
                                        isDarkMode
                                          ? 'hover:bg-gray-700'
                                          : 'hover:bg-gray-100'
                                      } text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors`}
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </motion.button>
                                    <motion.button
                                      onClick={() => deleteCustomRule(rule.pattern, rule.type)}
                                      className={`p-2 rounded-xl ${
                                        isDarkMode
                                          ? 'hover:bg-red-500/20'
                                          : 'hover:bg-red-50'
                                      } text-[var(--text-secondary)] hover:text-red-500 transition-colors`}
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </motion.button>
                                  </div>
                                </div>
                              </motion.div>
                              <AnimatePresence>
                                {editingRule && !isAddingRule && editingRule.originalPattern === rule.pattern && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className={`overflow-hidden ${
                                      isDarkMode ? 'bg-gray-800/60' : 'bg-gray-50/50'
                                    }`}
                                  >
                                    <div className="p-6 space-y-5 border-t border-[var(--border-color)]/10">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                                            匹配模式
                                          </label>
                                          <div className="relative">
                                            <Terminal className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-secondary)]" />
                                            <input
                                              type="text"
                                              value={editingRule.pattern}
                                              onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                              placeholder="输入匹配模式或命令..."
                                              className={`w-full pl-12 pr-4 py-3 rounded-xl ${
                                                isDarkMode
                                                  ? 'bg-gray-700/50 border-gray-600'
                                                  : 'bg-white border-gray-200'
                                              } border text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono text-sm`}
                                            />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                                            规则类型
                                          </label>
                                          <div className="flex gap-2">
                                            {(['block', 'confirm', 'warn'] as const).map((type) => (
                                              <button
                                                key={type}
                                                onClick={() => setEditingRule({ ...editingRule, type })}
                                                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                                  editingRule.type === type
                                                    ? `${ruleTypeConfig[type].bgColor} ${ruleTypeConfig[type].textColor} ring-2 ring-current/30`
                                                    : isDarkMode
                                                      ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                                                      : 'bg-white text-gray-600 hover:bg-gray-50'
                                                }`}
                                              >
                                                <RuleTypeIcon type={type} className="w-4 h-4" />
                                                {ruleTypeConfig[type].label}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                                          规则描述
                                        </label>
                                        <input
                                          type="text"
                                          value={editingRule.description}
                                          onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                                          placeholder="描述这条规则的作用..."
                                          className={`w-full px-4 py-3 rounded-xl ${
                                            isDarkMode
                                              ? 'bg-gray-700/50 border-gray-600'
                                              : 'bg-white border-gray-200'
                                          } border text-[var(--foreground)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
                                        />
                                      </div>
                                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]/20">
                                        <motion.button
                                          onClick={() => {
                                            setEditingRule(null);
                                            setIsAddingRule(false);
                                          }}
                                          className="px-5 py-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors text-sm font-medium"
                                          whileHover={{ scale: 1.02 }}
                                          whileTap={{ scale: 0.98 }}
                                        >
                                          取消
                                        </motion.button>
                                        <motion.button
                                          onClick={() => {
                                            updateCustomRule(
                                              editingRule.originalPattern || editingRule.pattern,
                                              editingRule.originalType || editingRule.type,
                                              editingRule
                                            );
                                          }}
                                          disabled={!editingRule.pattern || !editingRule.description}
                                          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--foreground)] text-[var(--background)] font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                          whileHover={{ scale: editingRule.pattern && editingRule.description ? 1.02 : 1 }}
                                          whileTap={{ scale: editingRule.pattern && editingRule.description ? 0.98 : 1 }}
                                        >
                                          <Check className="w-4 h-4" />
                                          保存修改
                                        </motion.button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {activeSection === 'services' && (
          <motion.div
            key="services"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)]">服务管理</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                管理 AIGov 安全防护服务的安装与卸载
              </p>
            </div>

            <GlassCard className="p-6" delay={0.1}>
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                  protectionStatus.status === 'not_installed'
                    ? 'bg-gradient-to-br from-orange-500 to-amber-600'
                    : protectionStatus.isEnabled
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                }`}>
                  {protectionStatus.status === 'not_installed' ? (
                    <Package className="w-8 h-8 text-white" />
                  ) : protectionStatus.isEnabled ? (
                    <ShieldCheck className="w-8 h-8 text-white" />
                  ) : (
                    <ShieldOff className="w-8 h-8 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-[var(--foreground)]">
                    AIGov-Insight 安全防护服务
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">
                    {protectionStatus.status === 'not_installed'
                      ? '服务未安装'
                      : protectionStatus.isEnabled
                        ? `服务运行中 · 版本 ${protectionStatus.version || '未知'}`
                        : '服务已安装但未启用'
                    }
                  </p>
                  {protectionStatus.status !== 'not_installed' && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`w-2 h-2 rounded-full ${protectionStatus.isEnabled ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      <span className={`text-xs ${protectionStatus.isEnabled ? 'text-emerald-500' : 'text-gray-400'}`}>
                        {protectionStatus.isEnabled ? '运行中' : '已停止'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {protectionStatus.status === 'not_installed' ? (
                  <motion.button
                    onClick={() => {
                      setInstallMessage('');
                      setIsInstalling(false);
                      setShowInstallModal(true);
                    }}
                    className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium shadow-lg shadow-blue-500/25"
                    whileHover={{ scale: 1.02, boxShadow: '0 10px 30px rgba(99, 102, 241, 0.4)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Download className="w-5 h-5" />
                    安装 AIGov 服务
                  </motion.button>
                ) : (
                  <>
                    <motion.button
                      onClick={toggleProtection}
                      disabled={isTogglingProtection}
                      className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-medium transition-all ${
                        protectionStatus.isEnabled
                          ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25'
                      }`}
                      whileHover={{ scale: isTogglingProtection ? 1 : 1.02 }}
                      whileTap={{ scale: isTogglingProtection ? 1 : 0.98 }}
                    >
                      {isTogglingProtection ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : protectionStatus.isEnabled ? (
                        <Power className="w-5 h-5" />
                      ) : (
                        <Power className="w-5 h-5" />
                      )}
                      {isTogglingProtection ? '处理中...' : protectionStatus.isEnabled ? '停止服务' : '启动服务'}
                    </motion.button>

                    <motion.button
                      onClick={() => setShowUninstallModal(true)}
                      className={`flex items-center justify-center gap-3 px-6 py-4 rounded-2xl font-medium ${
                        isDarkMode
                          ? 'bg-gray-700/50 hover:bg-red-500/20 text-red-400'
                          : 'bg-gray-100 hover:bg-red-50 text-red-500'
                      } transition-colors`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Trash className="w-5 h-5" />
                      卸载服务
                    </motion.button>
                  </>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-6" delay={0.2}>
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">服务信息</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-[var(--border-color)]/30">
                  <span className="text-[var(--text-secondary)]">服务名称</span>
                  <span className="text-[var(--foreground)] font-medium">AIGov-Insight</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-[var(--border-color)]/30">
                  <span className="text-[var(--text-secondary)]">服务状态</span>
                  <span className={`font-medium ${
                    protectionStatus.status === 'not_installed' ? 'text-orange-500' :
                    protectionStatus.isEnabled ? 'text-emerald-500' : 'text-gray-400'
                  }`}>
                    {protectionStatus.status === 'not_installed' ? '未安装' :
                     protectionStatus.isEnabled ? '运行中' : '已停止'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-[var(--border-color)]/30">
                  <span className="text-[var(--text-secondary)]">版本</span>
                  <span className="text-[var(--foreground)] font-medium">
                    {protectionStatus.version || '-'}
                  </span>
                </div>
                
              </div>
            </GlassCard>

            <GlassCard className="p-6" delay={0.3}>
              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">功能说明</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldX className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-[var(--foreground)]">阻断</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    直接阻止危险操作，保护系统安全
                  </p>
                </div>
                <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldQuestion className="w-5 h-5 text-orange-500" />
                    <span className="font-medium text-[var(--foreground)]">确认</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    需要用户确认后才能继续执行
                  </p>
                </div>
                <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50/50'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500" />
                    <span className="font-medium text-[var(--foreground)]">警告</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    记录警告信息，允许操作继续
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInstallModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => !isInstalling && setShowInstallModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md mx-4 rounded-3xl p-6 ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              } shadow-2xl`}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Package className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-[var(--foreground)]">安装 AIGov 防护服务</h3>
                  <p className="text-sm text-[var(--text-secondary)]">智能体安全治理插件</p>
                </div>
              </div>
              
              <div className={`p-4 rounded-xl mb-6 ${isDarkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-600 dark:text-amber-400 mb-1">安装提醒</p>
                    <p className="text-amber-600/80 dark:text-amber-400/80">
                      安装完成后将自动重启 OpenClaw Gateway 服务，请确保保存当前工作。
                    </p>
                  </div>
                </div>
              </div>

              {installMessage && (
                <div className={`p-4 rounded-xl mb-6 ${
                  installMessage.includes('成功') 
                    ? (isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50')
                    : (isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50')
                }`}>
                  <div className="flex items-center gap-3">
                    {isInstalling && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                    {!isInstalling && installMessage.includes('成功') && <Check className="w-5 h-5 text-emerald-500" />}
                    <p className={`text-sm ${
                      installMessage.includes('成功')
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>{installMessage}</p>
                  </div>
                </div>
              )}

              {!installMessage?.includes('成功') && (
                <div className="flex gap-3">
                  <motion.button
                    onClick={() => {
                      setShowInstallModal(false);
                      setInstallMessage('');
                    }}
                    disabled={isInstalling}
                    className={`flex-1 py-3 rounded-xl font-medium ${
                      isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                    } text-[var(--foreground)] transition-colors disabled:opacity-50`}
                    whileHover={{ scale: isInstalling ? 1 : 1.02 }}
                    whileTap={{ scale: isInstalling ? 1 : 0.98 }}
                  >
                    取消
                  </motion.button>
                  <motion.button
                    onClick={installPlugin}
                    disabled={isInstalling}
                    className="flex-1 py-3 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25 disabled:opacity-50"
                    whileHover={{ scale: isInstalling ? 1 : 1.02 }}
                    whileTap={{ scale: isInstalling ? 1 : 0.98 }}
                  >
                    {isInstalling ? '安装中...' : '确认安装'}
                  </motion.button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {showUninstallModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => !isUninstalling && setShowUninstallModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md mx-4 rounded-3xl p-6 ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              } shadow-2xl`}
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                  <Trash className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-[var(--foreground)]">卸载 AIGov 防护服务</h3>
                  <p className="text-sm text-[var(--text-secondary)]">移除智能体安全治理插件</p>
                </div>
              </div>
              
              <div className={`p-4 rounded-xl mb-6 ${isDarkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-red-600 dark:text-red-400 mb-1">卸载警告</p>
                    <p className="text-red-600/80 dark:text-red-400/80">
                      卸载后将移除所有防护规则，并自动重启 OpenClaw Gateway 服务。您的自定义规则配置将被保留。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  onClick={() => setShowUninstallModal(false)}
                  disabled={isUninstalling}
                  className={`flex-1 py-3 rounded-xl font-medium ${
                    isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                  } text-[var(--foreground)] transition-colors disabled:opacity-50`}
                  whileHover={{ scale: isUninstalling ? 1 : 1.02 }}
                  whileTap={{ scale: isUninstalling ? 1 : 0.98 }}
                >
                  取消
                </motion.button>
                <motion.button
                  onClick={uninstallPlugin}
                  disabled={isUninstalling}
                  className="flex-1 py-3 rounded-xl font-medium bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/25 disabled:opacity-50"
                  whileHover={{ scale: isUninstalling ? 1 : 1.02 }}
                  whileTap={{ scale: isUninstalling ? 1 : 0.98 }}
                >
                  {isUninstalling ? '卸载中...' : '确认卸载'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
