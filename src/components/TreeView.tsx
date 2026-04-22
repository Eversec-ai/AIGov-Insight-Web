'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Trees, ChevronDown, ChevronUp, Clock, Activity, BarChart3, Shield, Calendar, Info, AlertTriangle, AlertCircle, CheckCircle2, FileText, Zap, Network, LayoutDashboard, Layers, ShieldPlus, Sparkles, ShieldX, ShieldQuestion, ShieldAlert } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ParsedLogEntry } from '@/types/log';
import { getDataTypeColor, getDataTypeIcon } from '@/lib/logParser';
import { aggregateSessions } from '@/lib/sessionAggregator';
import { TopologyGraph } from './TopologyGraph';
import { useTheme } from '@/context/ThemeContext';
import { CopyableLogId } from '@/components/CopyableLogId';
import { useProtectionRule, PrefilledRuleData } from '@/context/ProtectionRuleContext';

interface TreeViewProps {
  logs: ParsedLogEntry[];
  targetSessionId?: string | null;
  filterConditions?: {
    types: {
      'HTTP': boolean;
      'LLM': boolean;
      'AGENT': boolean;
      'RAG': boolean;
      'MCP': boolean;
      'AG-UI': boolean;
      'FILE': boolean;
      'EXEC': boolean;
      'TOOLCALL': boolean;
      'OPENCLAW': boolean;
      'UNKNOWN': boolean;
    };
    riskLevels: {
      'HIGH': boolean;
      'MEDIUM': boolean;
      'LOW': boolean;
      'INFO': boolean;
    };
    searchKeyword: string;
  };
  onTypeFilterClick?: (type: string) => void;
  onNavigateToSecurity?: () => void;
}

interface AggregatedSession {
  id: string;
  mainEntry: ParsedLogEntry;
  allEntries: ParsedLogEntry[];
  startTime: Date;
  endTime: Date;
}

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

// 解析OPENCLAW的payload，提取method信息
const parseOpenClawMethods = (payload: string): string[] => {
  if (!payload) return [];
  
  try {
    const methods: string[] = [];
    const jsonObjects = payload.split('}{').map((obj, index, arr) => {
      if (index === 0) return obj + '}';
      if (index === arr.length - 1) return '{' + obj;
      return '{' + obj + '}';
    });
    
    for (const jsonStr of jsonObjects) {
      try {
        const obj = JSON.parse(jsonStr);
        if (obj.method) {
          methods.push(obj.method);
        }
      } catch {
        // 忽略解析失败的JSON对象
      }
    }
    
    return methods;
  } catch {
    return [];
  }
};

// 解析VLLM的SSE格式response，提取关键信息
interface VLLMResponseInfo {
  toolCalls?: Array<{name: string; arguments: string}>;
  usage?: {prompt_tokens: number; completion_tokens: number; total_tokens: number};
  finishReason?: string;
  hasContent?: boolean;
}

const parseVLLMResponse = (payload: string): VLLMResponseInfo => {
  if (!payload) return {};
  
  try {
    const result: VLLMResponseInfo = {};
    const toolCallsMap = new Map<string, {name: string; arguments: string}>();
    
    // 提取所有data:开头的行
    const lines = payload.split('\n');
    const dataLines = lines.filter(line => line.trim().startsWith('data:'));
    
    for (const line of dataLines) {
      try {
        const jsonStr = line.replace(/^data:\s*/, '').trim();
        if (jsonStr === '[DONE]') continue;
        
        const obj = JSON.parse(jsonStr);
        
        // 提取usage信息
        if (obj.usage) {
          result.usage = {
            prompt_tokens: obj.usage.prompt_tokens || 0,
            completion_tokens: obj.usage.completion_tokens || 0,
            total_tokens: obj.usage.total_tokens || 0
          };
        }
        
        // 提取tool_calls信息
        if (obj.choices && Array.isArray(obj.choices)) {
          for (const choice of obj.choices) {
            // 提取finish_reason
            if (choice.finish_reason && !result.finishReason) {
              result.finishReason = choice.finish_reason;
            }
            
            // 提取tool_calls
            if (choice.delta && choice.delta.tool_calls) {
              for (const tc of choice.delta.tool_calls) {
                if (tc.function) {
                  const id = tc.id || `index_${tc.index}`;
                  if (!toolCallsMap.has(id)) {
                    toolCallsMap.set(id, {name: '', arguments: ''});
                  }
                  const existing = toolCallsMap.get(id)!;
                  if (tc.function.name) {
                    existing.name = tc.function.name;
                  }
                  if (tc.function.arguments) {
                    existing.arguments += tc.function.arguments;
                  }
                }
              }
            }
            
            // 检查是否有content
            if (choice.delta && choice.delta.content) {
              result.hasContent = true;
            }
          }
        }
      } catch {
        // 忽略解析失败的JSON对象
      }
    }
    
    // 转换tool_calls为数组
    if (toolCallsMap.size > 0) {
      result.toolCalls = Array.from(toolCallsMap.values());
    }
    
    return result;
  } catch {
    return {};
  }
};

// 分析结果接口
interface AnalysisResult {
  id: string;
  type: 'loop' | 'data_leak' | 'api_abuse' | 'system_abuse' | 'info';
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  affectedEntries: ParsedLogEntry[];
  riskScore: number;
  icon: React.ReactNode;
}

// 启发式分析函数
const runHeuristicAnalysis = (entries: ParsedLogEntry[]): AnalysisResult[] => {
  const results: AnalysisResult[] = [];

  // 1. 高风险话单检测
  const highRiskEntries = entries.filter(e => e.dataType === 'FILE' && e.llmProvider === 'HIGH');
  if (highRiskEntries.length > 0) {
    results.push({
      id: `high-risk-${Date.now()}-${Math.random()}`,
      type: 'data_leak',
      severity: 'high',
      title: '高风险话单检测',
      description: `检测到 ${highRiskEntries.length} 个高风险文件操作，需要重点关注`,
      affectedEntries: highRiskEntries,
      riskScore: 5,
      icon: <Shield className="w-5 h-5 text-red-500" />
    });
  }

  // 2. 推理循环检测
  const llmEntries = entries.filter(e => e.dataType === 'LLM');
  const recentLLMEntries = llmEntries.slice(-10);
  const errorCounts = recentLLMEntries.reduce((acc, entry) => {
    const error = entry.llmAnswer?.toLowerCase().includes('error') || entry.parsedAnswer?.toLowerCase().includes('error');
    if (error) {
      const errorMsg = entry.llmAnswer || entry.parsedAnswer || '';
      acc[errorMsg] = (acc[errorMsg] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  Object.entries(errorCounts).forEach(([errorMsg, count]) => {
    if (count >= 3) {
      results.push({
        id: `loop-${Date.now()}-${Math.random()}`,
        type: 'loop',
        severity: 'high',
        title: '推理循环检测',
        description: `检测到 ${count} 次相同的错误响应，可能存在推理循环`,
        affectedEntries: recentLLMEntries.filter(e => 
          (e.llmAnswer || e.parsedAnswer || '').toLowerCase().includes('error')
        ),
        riskScore: 3,
        icon: <AlertTriangle className="w-5 h-5 text-red-500" />
      });
    }
  });

  // 3. LLM 轮数异常检测
  const llmRounds = entries.filter(e => e.dataType === 'LLM' && e.llmRound);
  const roundNumbers = llmRounds.map(e => parseInt(e.llmRound || '0'));
  const zeroRoundCount = roundNumbers.filter(r => r === 0).length;
  
  if (llmEntries.length > 5 && zeroRoundCount > llmEntries.length * 0.5) {
    results.push({
      id: `round-anomaly-${Date.now()}-${Math.random()}`,
      type: 'loop',
      severity: 'medium',
      title: 'LLM 轮数异常检测',
      description: `${llmEntries.length} 次 LLM 调用中 ${zeroRoundCount} 次轮数为 0，可能存在配置问题`,
      affectedEntries: llmRounds.filter(e => parseInt(e.llmRound || '0') === 0),
      riskScore: 2,
      icon: <AlertTriangle className="w-5 h-5 text-orange-500" />
    });
  }

  // 4. 数据泄露检测
  const fileEntries = entries.filter(e => e.dataType === 'FILE');
  const sensitiveFiles = ['/etc/passwd', '/etc/shadow', '/etc/hosts', '/root/.ssh', '/home/.ssh', '/etc/gshadow'];
  const accessedSensitiveFiles = fileEntries.filter(entry => {
    const decodedPath = decodeBase64(entry.answer);
    return sensitiveFiles.some(sf => decodedPath.includes(sf));
  });

  if (accessedSensitiveFiles.length > 0) {
    const hasNetworkAfter = entries.some(entry => {
      const fileTime = new Date(entry.collectTime).getTime();
      return accessedSensitiveFiles.some(af => {
        const afTime = new Date(af.collectTime).getTime();
        return entry.dataType === 'HTTP' && Math.abs(fileTime - afTime) < 5000;
      });
    });

    if (hasNetworkAfter) {
      results.push({
        id: `leak-${Date.now()}-${Math.random()}`,
        type: 'data_leak',
        severity: 'high',
        title: '数据泄露风险',
        description: `检测到访问敏感文件 ${accessedSensitiveFiles.length} 次，随后有网络行为`,
        affectedEntries: accessedSensitiveFiles,
        riskScore: 5,
        icon: <Shield className="w-5 h-5 text-red-500" />
      });
    }
  }

  // 5. 异常 IP 组合检测
  const ipCombinations = new Map<string, ParsedLogEntry[]>();
  entries.forEach(entry => {
    if (entry.reqIp && entry.respIp) {
      const key = `${entry.reqIp}:${entry.respIp}`;
      if (!ipCombinations.has(key)) {
        ipCombinations.set(key, []);
      }
      ipCombinations.get(key)!.push(entry);
    }
  });

  ipCombinations.forEach((entries, key) => {
    if (entries.length > 20) {
      const [reqIp, respIp] = key.split(':');
      results.push({
        id: `ip-anomaly-${Date.now()}-${Math.random()}`,
        type: 'system_abuse',
        severity: 'medium',
        title: '异常 IP 组合检测',
        description: `检测到从 ${reqIp} 到 ${respIp} 的 ${entries.length} 次请求，超过阈值 20`,
        affectedEntries: entries,
        riskScore: 2,
        icon: <Network className="w-5 h-5 text-orange-500" />
      });
    }
  });

  // 6. 异常进程行为检测
  const processEntries = entries.filter(e => e.pName);
  const processCounts = processEntries.reduce((acc, entry) => {
    const process = entry.pName || 'unknown';
    acc[process] = (acc[process] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const suspiciousProcesses = ['swapper', 'kthreadd', 'ksoftirqd', 'migration', 'rcu_sched'];
  suspiciousProcesses.forEach(process => {
    const count = processCounts[process] || 0;
    if (count > 0) {
      results.push({
        id: `process-anomaly-${Date.now()}-${Math.random()}`,
        type: 'system_abuse',
        severity: 'low',
        title: '异常进程行为检测',
        description: `检测到系统进程 ${process} 有 ${count} 次操作，可能存在异常行为`,
        affectedEntries: processEntries.filter(e => e.pName === process),
        riskScore: 1,
        icon: <AlertCircle className="w-5 h-5 text-yellow-500" />
      });
    }
  });

  // 7. 高频操作检测
  const timeGroups = new Map<string, ParsedLogEntry[]>();
  entries.forEach(entry => {
    const time = new Date(entry.collectTime);
    const timeKey = `${time.getHours()}:${Math.floor(time.getMinutes() / 5) * 5}`;
    if (!timeGroups.has(timeKey)) {
      timeGroups.set(timeKey, []);
    }
    timeGroups.get(timeKey)!.push(entry);
  });

  timeGroups.forEach((entries, timeKey) => {
    if (entries.length > 50) {
      results.push({
        id: `high-freq-${Date.now()}-${Math.random()}`,
        type: 'system_abuse',
        severity: 'medium',
        title: '高频操作检测',
        description: `在 ${timeKey} 时间段内检测到 ${entries.length} 次操作，超过阈值 50`,
        affectedEntries: entries,
        riskScore: 2,
        icon: <Zap className="w-5 h-5 text-orange-500" />
      });
    }
  });

  // 8. API 滥用检测
  const totalTokens = entries.reduce((sum, entry) => {
    const tokens = parseInt(entry.llmTokenTotal || entry.tokenTotal || '0');
    return sum + tokens;
  }, 0);

  if (totalTokens > 10000) {
    results.push({
      id: `api-abuse-${Date.now()}-${Math.random()}`,
      type: 'api_abuse',
      severity: 'medium',
      title: 'API 滥用检测',
      description: `总 Token 使用量 ${totalTokens.toLocaleString()}，超过阈值 10,000`,
      affectedEntries: llmEntries,
      riskScore: 2,
      icon: <Zap className="w-5 h-5 text-orange-500" />
    });
  }

  // 9. 系统调用异常检测
  const systemCallCount = entries.filter(e => e.dataType === 'FILE').length;
  if (systemCallCount > 1000) {
    results.push({
      id: `system-abuse-${Date.now()}-${Math.random()}`,
      type: 'system_abuse',
      severity: 'medium',
      title: '系统调用异常',
      description: `系统调用次数 ${systemCallCount.toLocaleString()}，超过阈值 1,000`,
      affectedEntries: fileEntries,
      riskScore: 1,
      icon: <Network className="w-5 h-5 text-orange-500" />
    });
  }

  // 10. 会话健康度评估
  const uniqueTypes = new Set(entries.map(e => e.dataType)).size;
  const duration = entries.length > 0 
    ? new Date(entries[entries.length - 1].collectTime).getTime() - new Date(entries[0].collectTime).getTime()
    : 0;
  const durationMinutes = duration / (1000 * 60);

  if (entries.length > 0 && uniqueTypes >= 3 && durationMinutes < 1) {
    results.push({
      id: `info-${Date.now()}-${Math.random()}`,
      type: 'info',
      severity: 'info',
      title: '会话健康度评估',
      description: `会话包含 ${uniqueTypes} 种类型，在 ${durationMinutes.toFixed(1)} 分钟内完成`,
      affectedEntries: [],
      riskScore: 0,
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />
    });
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
};

export function TreeView({ logs, targetSessionId, filterConditions, onTypeFilterClick, onNavigateToSecurity }: TreeViewProps) {
  const { isDarkMode } = useTheme();
  const { setPrefilledRule } = useProtectionRule();
  const [aggregatedSessions, setAggregatedSessions] = useState<AggregatedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AggregatedSession | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState(false);
  const [isNaturalLanguageMode, setIsNaturalLanguageMode] = useState(true);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const hasScrolledToTarget = useRef(false);
  
  const defaultFilterConditions = {
    types: {
      'HTTP': true,
      'LLM': true,
      'AGENT': true,
      'RAG': true,
      'MCP': true,
      'AG-UI': true,
      'FILE': true,
      'EXEC': true,
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
  };
  
  // 使用提供的过滤条件或默认值
  const currentFilterConditions = filterConditions || defaultFilterConditions;

  const filterMenuRef = useRef<HTMLDivElement>(null);

  // 获取搜索关键词，优先使用来自父组件的searchKeyword，其次使用本地的searchTerm
  const searchKeyword = currentFilterConditions.searchKeyword || searchTerm;
  
  // 根据搜索关键词过滤会话
  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) {
      return aggregatedSessions;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return aggregatedSessions.filter(session => {
      // 搜索会话ID
      if (session.mainEntry.logID.toLowerCase().includes(searchLower)) {
        return true;
      }
      return false;
    });
  }, [aggregatedSessions, searchTerm]);

  // 关键字高亮函数
  const highlightKeyword = (text: string | undefined, keyword: string): React.ReactNode => {
    if (!text || !keyword.trim()) {
      return text;
    }
    
    const searchLower = keyword.toLowerCase();
    const textLower = text.toLowerCase();
    const matches = [];
    let lastIndex = 0;
    
    // 查找所有匹配的位置
    let matchIndex = textLower.indexOf(searchLower);
    while (matchIndex !== -1) {
      // 添加匹配前的文本
      if (matchIndex > lastIndex) {
        matches.push(
          <span key={`normal-${lastIndex}`}>
            {text.substring(lastIndex, matchIndex)}
          </span>
        );
      }
      
      // 添加匹配的文本，带高亮样式
      matches.push(
        <span 
          key={`highlight-${matchIndex}`} 
          className="bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] font-medium"
        >
          {text.substring(matchIndex, matchIndex + keyword.length)}
        </span>
      );
      
      // 更新索引
      lastIndex = matchIndex + keyword.length;
      matchIndex = textLower.indexOf(searchLower, lastIndex);
    }
    
    // 添加剩余的文本
    if (lastIndex < text.length) {
      matches.push(
        <span key={`normal-${lastIndex}`}>
          {text.substring(lastIndex)}
        </span>
      );
    }
    
    return matches;
  };
  
  // 关联聚合话单
  useEffect(() => {
    // 首先聚合所有会话，不应用过滤条件
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

    const matchedSession = aggregatedSessions.find(session =>
      session.mainEntry.logID === targetSessionId
    );

    if (matchedSession) {
      setSelectedSession(matchedSession);
      setSearchTerm(targetSessionId);
      if (!hasScrolledToTarget.current) {
        window.scrollTo(0, 0);
        hasScrolledToTarget.current = true;
      }
    }
  }, [targetSessionId, aggregatedSessions]);

  // 当选中会话变化时，运行启发式分析
  useEffect(() => {
    if (selectedSession) {
      const results = runHeuristicAnalysis(selectedSession.allEntries);
      setAnalysisResults(results);
    } else {
      setAnalysisResults([]);
    }
  }, [selectedSession]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setIsSessionDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 格式化时间，添加毫秒
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      fractionalSecondDigits: 3
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

  // 生成自然语言描述
  const generateNaturalLanguageDescription = (entry: ParsedLogEntry): string => {
    const decodedPath = decodeBase64(entry.answer);
    
    switch (entry.dataType) {
      case 'FILE':
        const fileRiskLevel = entry.llmProvider || '未知';
        const fileRiskDesc = fileRiskLevel === 'HIGH' ? '（高风险）' : fileRiskLevel === 'MEDIUM' ? '（中风险）' : fileRiskLevel === 'LOW' ? '（低风险）' : '';
        return `进程 ${entry.pName || '未知进程'} 访问了文件 ${decodedPath || '未知路径'} ${fileRiskDesc}`;
      
      case 'EXEC':
        const execRiskLevel = entry.llmProvider || '未知';
        const execRiskDesc = execRiskLevel === 'HIGH' ? '（高风险）' : execRiskLevel === 'MEDIUM' ? '（中风险）' : execRiskLevel === 'LOW' ? '（低风险）' : '';
        const execCmd = entry.parsedQuery || entry.query || '未知命令';
        const execPath = decodedPath || '未知路径';
        const argc = entry.tokenTotal || '未知';
        return `执行命令 ${execCmd}，路径: ${execPath}，参数数量: ${argc} ${execRiskDesc}`;
      
      case 'TOOLCALL':
        const tcToolName = entry.toolName || '未知工具';
        const tcStatus = decodeBase64(entry.answer);
        const tcRiskLevel = entry.llmProvider || '';
        const tcRiskDesc = tcRiskLevel === 'HIGH' ? '（高风险）' : tcRiskLevel === 'MEDIUM' ? '（中风险）' : tcRiskLevel === 'LOW' ? '（低风险）' : '';
        const tcStatusMap: Record<string, string> = { completed: '已完成', failed: '失败', blocked: '已拦截', running: '运行中' };
        const tcStatusText = tcStatusMap[tcStatus] || tcStatus || '未知';
        const tcToolTypeIdx = parseInt(entry.tokenCompletion);
        const tcToolType = !isNaN(tcToolTypeIdx) && tcToolTypeIdx >= 0 ? ['tool', 'command', 'patch', 'search', 'analysis', 'skill'][tcToolTypeIdx] : '';
        const tcIsSkill = entry.llmStream === '1';
        const tcSkillName = tcIsSkill ? entry.agentName : '';
        const tcIsError = entry.llmRound === '1';
        const tcLatency = entry.latency ? `${(parseFloat(entry.latency)).toFixed(2)}s` : '';
        const tcQuery = entry.parsedQuery || '';
        
        let tcDesc = `调用工具 ${tcToolName}`;
        if (tcToolType) tcDesc += ` (${tcToolType})`;
        if (tcQuery) {
          const shortQ = tcQuery.length > 30 ? tcQuery.substring(0, 30) + '...' : tcQuery;
          tcDesc += `，${shortQ}`;
        }
        tcDesc += `，状态: ${tcStatusText}`;
        if (tcLatency) tcDesc += `，耗时: ${tcLatency}`;
        if (tcIsSkill && tcSkillName) tcDesc += `，技能: ${tcSkillName}`;
        if (tcIsError) {
          const tcError = decodeBase64(entry.ragContent);
          if (tcError) tcDesc += `，错误: ${tcError.length > 30 ? tcError.substring(0, 30) + '...' : tcError}`;
          else tcDesc += `，执行失败`;
        }
        tcDesc += ` ${tcRiskDesc}`;
        return tcDesc;
      
      case 'OPENCLAW':
        // 解析OPENCLAW的payload，提取method信息
        const openclawMethods = parseOpenClawMethods(entry.parsedReqPayload || '');
        const openclawRiskLevel = entry.llmProvider || '未知';
        const openclawRiskDesc = openclawRiskLevel === 'HIGH' ? '（高风险）' : openclawRiskLevel === 'MEDIUM' ? '（中风险）' : openclawRiskLevel === 'LOW' ? '（低风险）' : '';
        
        if (openclawMethods.length > 0) {
          // 根据method类型生成更友好的描述
          const method = openclawMethods[0];
          if (method === 'node.list') {
            return `OpenClaw 节点列表查询 ${openclawRiskDesc}`;
          } else if (method === 'chat.history') {
            return `OpenClaw 聊天历史查询 ${openclawRiskDesc}`;
          } else if (method.startsWith('node.')) {
            return `OpenClaw 节点操作: ${method.substring(5)} ${openclawRiskDesc}`;
          } else if (method.startsWith('chat.')) {
            return `OpenClaw 聊天操作: ${method.substring(5)} ${openclawRiskDesc}`;
          } else {
            return `OpenClaw ${method} ${openclawRiskDesc}`;
          }
        }
        
        // 如果没有method，显示查询内容
        const openclawCmd = entry.parsedQuery || entry.query || '系统操作';
        return `OpenClaw ${openclawCmd} ${openclawRiskDesc}`;
      
      case 'HTTP':
        // HTTP请求：从源IP:端口向目标IP:端口发起了HTTP请求
        return `从 ${entry.reqIp}:${entry.reqPort} 向 ${entry.respIp}:${entry.respPort} 发起了HTTP请求`;
      
      case 'LLM':
        // LLM请求：使用llmModel处理了请求，包含查询和回答节选
        const llmModel = entry.llmModel || entry.ModelName || '未知模型';
        
        // 解析VLLM response，提取关键信息
        const vllmNatInfo = parseVLLMResponse(entry.parsedRspPayload || '');
        
        // 构建描述
        let llmDesc = `使用 ${llmModel}`;
        
        // 如果有tool_calls，显示工具调用信息
        if (vllmNatInfo.toolCalls && vllmNatInfo.toolCalls.length > 0) {
          const toolNames = vllmNatInfo.toolCalls.map(tc => tc.name).filter(Boolean);
          if (toolNames.length > 0) {
            llmDesc += ` 调用工具: ${toolNames.join(', ')}`;
          }
        } else if (vllmNatInfo.hasContent) {
          llmDesc += ` 生成对话响应`;
        } else {
          llmDesc += ` 处理了请求`;
        }
        
        // 添加usage信息
        if (vllmNatInfo.usage) {
          llmDesc += `，消耗了 ${vllmNatInfo.usage.total_tokens} 个token`;
        } else {
          const llmTokenInfo = entry.llmTokenTotal && parseInt(entry.llmTokenTotal) > 0 
            ? `，消耗了 ${entry.llmTokenTotal} 个LLM token` 
            : entry.tokenTotal && parseInt(entry.tokenTotal) > 0 
            ? `，消耗了 ${entry.tokenTotal} 个token` 
            : '';
          llmDesc += llmTokenInfo;
        }
        
        // 添加finish_reason
        if (vllmNatInfo.finishReason) {
          const reasonMap: Record<string, string> = {
            'tool_calls': '（工具调用）',
            'stop': '（正常结束）',
            'length': '（达到长度限制）'
          };
          llmDesc += reasonMap[vllmNatInfo.finishReason] || '';
        }
        
        // 添加Query节选
        const llmQuery = entry.llmQuery;
        const queryInfo = llmQuery ? `，查询：${llmQuery.length > 20 ? llmQuery.substring(0, 20) + '...' : llmQuery}` : '';
        llmDesc += queryInfo;
        
        // 添加Answer节选
        const llmAnswer = entry.llmAnswer;
        const answerInfo = llmAnswer ? `，回答：${llmAnswer.length > 20 ? llmAnswer.substring(0, 20) + '...' : llmAnswer}` : '';
        llmDesc += answerInfo;
        
        return llmDesc;
      
      case 'AGENT':
        // AGENT请求：Agent名称执行了操作，工作流状态
        return `${entry.agentName || '未知Agent'} 执行了操作，工作流状态：${entry.workflowStatus || '未知'}`;
      
      case 'RAG':
        // RAG请求：从数据集获取了文档内容，相似度得分
        return `从 ${entry.ragDataset || '未知数据集'} 获取了文档内容，相似度得分：${entry.ragScore || '未知'}`;
      
      case 'MCP':
        // MCP请求：调用了MCP方法，服务器名称，工具名称
        const mcpToolInfo = entry.mcpToolName ? `，工具：${entry.mcpToolName}` : '';
        return `调用了 MCP 方法 ${entry.mcpMethod || '未知'}，服务器：${entry.mcpServerName || '未知'}${mcpToolInfo}`;
      
      case 'AG-UI':
        const aguiModelInfo = entry.ModelName ? `，使用了 ${entry.ModelName}` : '';
        
        if (entry.workflowTotalSteps && parseInt(entry.workflowTotalSteps) > 0) {
          const aguiWorkflowInfo = entry.workflowStatus ? `，工作流：${entry.workflowStatus}` : '';
          const aguiStepsInfo = ` (${entry.workflowTotalSteps}步)`;
          
          let aguiPathInfo = '';
          if (entry.workflowNodes) {
            try {
              const nodes = JSON.parse(entry.workflowNodes);
              if (Array.isArray(nodes)) {
                const nodeNames = nodes.map(node => typeof node === 'string' ? node : node.name || node.id || '').filter(Boolean);
                if (nodeNames.length > 0) {
                  const shortPath = nodeNames.length > 3 ? nodeNames.slice(0, 3).join(' → ') + ' → ...' : nodeNames.join(' → ');
                  aguiPathInfo = `，路径：${shortPath}`;
                }
              } else if (typeof nodes === 'string' && nodes.length > 0) {
                const shortPath = nodes.length > 30 ? nodes.substring(0, 30) + '...' : nodes;
                aguiPathInfo = `，路径：${shortPath}`;
              }
            } catch (e) {
              if (entry.workflowNodes.length > 0) {
                const shortPath = entry.workflowNodes.length > 30 ? entry.workflowNodes.substring(0, 30) + '...' : entry.workflowNodes;
                aguiPathInfo = `，路径：${shortPath}`;
              }
            }
          }
          
          return `用户通过UI发起了请求${aguiModelInfo}${aguiWorkflowInfo}${aguiStepsInfo}${aguiPathInfo}`;
        } else {
          const queryInfo = entry.parsedQuery || entry.llmQuery || entry.query;
          const answerInfo = entry.parsedAnswer || entry.llmAnswer || entry.answer;
          
          if (queryInfo) {
            const shortQuery = queryInfo.length > 30 ? queryInfo.substring(0, 30) + '...' : queryInfo;
            const queryText = `查询：${shortQuery}`;
            
            if (answerInfo) {
              const shortAnswer = answerInfo.length > 30 ? answerInfo.substring(0, 30) + '...' : answerInfo;
              return `用户通过UI发起了请求${aguiModelInfo}，${queryText}，回答：${shortAnswer}`;
            }
            return `用户通过UI发起了请求${aguiModelInfo}，${queryText}`;
          }
          
          return `用户通过UI发起了请求${aguiModelInfo}`;
        }
      
      default:
        // 其他类型：数据类型请求，从源IP到目标IP
        return `${entry.dataType} 请求：从 ${entry.reqIp}:${entry.reqPort} 到 ${entry.respIp}:${entry.respPort}`;
    }
  };

  // 处理条目展开/折叠
  const toggleEntry = (entryId: string) => {
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const extractRuleDataFromEntry = (entry: ParsedLogEntry): PrefilledRuleData | null => {
    const sourceType = entry.dataType as PrefilledRuleData['sourceType'];
    let pattern = '';
    let description = '';
    let type: 'block' | 'confirm' | 'warn' = 'warn';
    
    if (entry.dataType === 'FILE' || entry.dataType === 'EXEC' || entry.dataType === 'TOOLCALL') {
      type = entry.llmProvider === 'HIGH' ? 'block' : entry.llmProvider === 'MEDIUM' ? 'confirm' : 'warn';
    }

    switch (entry.dataType) {
      case 'OPENCLAW':
      case 'LLM':
        pattern = entry.parsedQuery || entry.llmQuery || decodeBase64(entry.query) || '';
        if (!pattern) {
          pattern = entry.parsedAnswer || entry.llmAnswer || decodeBase64(entry.answer) || '';
        }
        if (!pattern) {
          const methods = parseOpenClawMethods(entry.parsedReqPayload || entry.reqPayload || '');
          if (methods.length > 0) {
            pattern = methods[0];
          }
        }
        if (!pattern && entry.ModelName) {
          pattern = entry.ModelName;
        }
        if (!pattern && entry.llmModel) {
          pattern = entry.llmModel;
        }
        if (!pattern) {
          pattern = `${entry.dataType} Request`;
        }
        description = `OpenClaw/LLM 请求防护 - ${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}`;
        break;
      
      case 'EXEC':
        pattern = entry.parsedQuery || entry.query || '';
        if (!pattern && entry.pName) {
          pattern = entry.pName;
        }
        if (!pattern) {
          pattern = 'Command Execution';
        }
        description = `命令执行防护 - ${entry.pName || '未知进程'}: ${pattern.substring(0, 30)}${pattern.length > 30 ? '...' : ''}`;
        break;
      
      case 'FILE':
        pattern = decodeBase64(entry.answer) || '';
        if (!pattern && entry.pName) {
          pattern = entry.pName;
        }
        if (!pattern) {
          pattern = 'File Operation';
        }
        description = `文件访问防护 - ${entry.pName || '未知进程'}: ${pattern.substring(0, 30)}${pattern.length > 30 ? '...' : ''}`;
        break;
      
      case 'TOOLCALL':
        pattern = entry.toolName || '';
        if (!pattern && entry.parsedQuery) {
          pattern = entry.parsedQuery;
        }
        if (!pattern) {
          pattern = 'Tool Call';
        }
        description = `工具调用防护 - ${entry.toolName || '未知工具'}: ${pattern.substring(0, 30)}${pattern.length > 30 ? '...' : ''}`;
        break;
      
      case 'HTTP':
        pattern = entry.parsedQuery || entry.query || `${entry.reqIp}:${entry.reqPort}`;
        if (!pattern) {
          pattern = 'HTTP Request';
        }
        description = `HTTP 请求防护 - ${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}`;
        break;
      
      case 'AGENT':
        pattern = entry.agentName || entry.agentID || '';
        if (entry.toolName) {
          pattern = entry.toolName;
        }
        if (!pattern) {
          pattern = 'Agent Operation';
        }
        description = `Agent 操作防护 - ${pattern}`;
        break;
      
      case 'RAG':
        pattern = entry.ragDocument || '';
        if (!pattern) {
          pattern = 'RAG Document';
        }
        description = `RAG 文档防护 - ${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}`;
        break;
      
      case 'MCP':
        pattern = entry.mcpMethod || entry.mcpToolName || '';
        if (!pattern) {
          pattern = 'MCP Tool';
        }
        description = `MCP 工具防护 - ${pattern}`;
        break;
      
      case 'AG-UI':
        pattern = entry.parsedQuery || entry.query || '';
        if (!pattern && entry.ModelName) {
          pattern = entry.ModelName;
        }
        if (!pattern) {
          pattern = 'AG-UI Interaction';
        }
        description = `AG-UI 交互防护 - ${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}`;
        break;
      
      default:
        pattern = entry.parsedQuery || entry.query || '';
        if (!pattern) {
          pattern = `${entry.dataType} Request`;
        }
        description = `通用防护规则 - ${pattern.substring(0, 50)}${pattern.length > 50 ? '...' : ''}`;
    }

    return {
      pattern,
      description,
      type,
      sourceType,
      sourceInfo: {
        logId: entry.logID,
        processName: entry.pName,
        timestamp: entry.collectTime,
      },
    };
  };

  const handleCreateProtectionRule = (entry: ParsedLogEntry, ruleType: 'block' | 'confirm' | 'warn') => {
    const baseRuleData = extractRuleDataFromEntry(entry);
    if (baseRuleData) {
      const ruleData = {
        ...baseRuleData,
        type: ruleType,
      };
      setPrefilledRule(ruleData);
      if (onNavigateToSecurity) {
        onNavigateToSecurity();
      }
    }
  };

  const ruleTypeButtons = [
    { 
      type: 'block' as const, 
      label: '拦截', 
      subLabel: 'Block',
      icon: ShieldX, 
      color: 'red',
      gradient: 'from-red-500 to-rose-600',
      description: '直接阻止请求',
    },
    { 
      type: 'confirm' as const, 
      label: '确认', 
      subLabel: 'Confirm',
      icon: ShieldQuestion, 
      color: 'orange',
      gradient: 'from-orange-500 to-amber-600',
      description: '需用户确认',
    },
    { 
      type: 'warn' as const, 
      label: '警告', 
      subLabel: 'Warn',
      icon: ShieldAlert, 
      color: 'yellow',
      gradient: 'from-yellow-500 to-amber-600',
      description: '记录并警告',
    },
  ];



  // 渲染单个日志条目（左右布局）
  const renderLogEntry = (entry: ParsedLogEntry, index: number) => {
    // 应用过滤条件
    // 1. 多选日志类型过滤 - 只显示被勾选的类型
    if (!currentFilterConditions.types[entry.dataType as keyof typeof currentFilterConditions.types]) {
      return null;
    }
    
    if (entry.dataType === 'FILE' || entry.dataType === 'EXEC' || entry.dataType === 'TOOLCALL') {
      if (entry.llmProvider && !currentFilterConditions.riskLevels[entry.llmProvider as keyof typeof currentFilterConditions.riskLevels]) {
        return null;
      }
    }
    
    // 不需要FILE类型控制，因为已经包含在types过滤中了
    const isExpanded = expandedEntries.has(entry.logID || '');

    // 直接使用解析后的字符串，不尝试解析为JSON
    const parsedReqPayload = entry.parsedReqPayload || '';
    const parsedQuery = entry.parsedQuery || '';

    // 优化卡片标题显示，优先显示关键信息
    const displayTitle = (() => {
      // 根据类型显示不同的关键信息
      switch (entry.dataType) {
        case 'HTTP':
          // 从HTTP请求中提取路径信息
          if (parsedReqPayload) {
            const match = parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
            if (match) {
              return `${match[1]} ${match[2]}`;
            }
          }
          break;
        case 'LLM':
        case 'AGENT':
          // 解析VLLM response，提取关键信息
          const vllmTitleInfo = parseVLLMResponse(entry.parsedRspPayload || '');
          
          // 如果有tool_calls，显示工具调用信息
          if (vllmTitleInfo.toolCalls && vllmTitleInfo.toolCalls.length > 0) {
            const toolNames = vllmTitleInfo.toolCalls.map(tc => tc.name).filter(Boolean);
            if (toolNames.length > 0) {
              const modelName = entry.ModelName || entry.llmModel || 'LLM';
              return `${modelName} 调用工具: ${toolNames.join(', ')}`;
            }
          }
          
          // 如果有finish_reason为tool_calls，说明是工具调用
          if (vllmTitleInfo.finishReason === 'tool_calls') {
            const modelName = entry.ModelName || entry.llmModel || 'LLM';
            return `${modelName} 工具调用`;
          }
          
          // 如果有content，说明是普通对话
          if (vllmTitleInfo.hasContent) {
            const modelName = entry.ModelName || entry.llmModel || 'LLM';
            return `${modelName} 对话响应`;
          }
          
          // 显示模型名称
          if (entry.ModelName) {
            return `${entry.ModelName} Request`;
          } else {
            if (parsedReqPayload) {
              const match = parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
              if (match) {
                return `${match[1]} ${match[2]}`;
              }
            }
          }
          break;
        case 'AG-UI':
          // 提取HTTP方法
          let httpMethod = '';
          let httpURL = '';
          if (parsedReqPayload) {
            const methodMatch = parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
            if (methodMatch) {
              httpMethod = methodMatch[1];
              httpURL = methodMatch[2];
            }
          }

          // 优先显示带有query的标题，结合HTTP方法
          if (parsedQuery) {
            const shortQuery = parsedQuery.length > 50 ? parsedQuery.substring(0, 50) + '...' : parsedQuery;
            if (httpMethod && entry.ModelName) {
              return `${httpMethod} ${httpURL} ${entry.ModelName} - ${shortQuery}`;
            } else if (httpMethod) {
              return `${httpMethod} ${httpURL} - ${shortQuery}`;
            } else if (entry.ModelName) {
              return `${entry.ModelName} - ${shortQuery}`;
            } else {
              return shortQuery;
            }
          }
          // 显示模型名称和HTTP方法
          else if (entry.ModelName) {
            if (httpMethod) {
              return `${httpMethod} ${entry.ModelName}`;
            } else {
              return entry.ModelName;
            }
          } else {
            // 从请求负载中提取信息
            if (parsedReqPayload) {
              const match = parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
              if (match) {
                return `${match[1]} ${match[2]}`;
              }
            }
          }
          break;
        case 'RAG':
          // 显示RAG相关信息
          if (entry.ragDocument) {
            return `RAG: ${entry.ragDocument}`;
          }
          break;
        case 'MCP':
          // 显示MCP方法名
          if (entry.mcpMethod) {
            return `MCP: ${entry.mcpMethod}`;
          }
          break;
        case 'FILE':
          if (entry.answer) {
            const decodedPath = decodeBase64(entry.answer);
            const path = decodedPath.length > 128 ? decodedPath.substring(0, 128) + '...' : decodedPath;
            return `${path}`;
          }
          if (entry.pName) {
            return `${entry.pName}`;
          }
          return 'File Operation';
        case 'EXEC':
          if (parsedQuery) {
            return parsedQuery.length > 100 ? parsedQuery.substring(0, 100) + '...' : parsedQuery;
          }
          if (entry.pName) {
            return `${entry.pName}`;
          }
          return 'Command Execution';
        case 'TOOLCALL':
          const tcTitleToolName = entry.toolName || '未知工具';
          const tcTitleStatus = decodeBase64(entry.answer) || '';
          const tcTitleQuery = entry.parsedQuery || '';
          if (tcTitleQuery) {
            const shortQuery = tcTitleQuery.length > 60 ? tcTitleQuery.substring(0, 60) + '...' : tcTitleQuery;
            return `${tcTitleToolName} - ${shortQuery}`;
          }
          if (tcTitleStatus) {
            return `${tcTitleToolName} [${tcTitleStatus}]`;
          }
          return `${tcTitleToolName} 工具调用`;
        case 'OPENCLAW':
          // 解析OPENCLAW的payload，提取method信息
          const titleMethods = parseOpenClawMethods(parsedReqPayload);
          if (titleMethods.length > 0) {
            const method = titleMethods[0];
            if (method === 'node.list') {
              return 'OpenClaw 节点列表查询';
            } else if (method === 'chat.history') {
              return 'OpenClaw 聊天历史查询';
            } else if (method.startsWith('node.')) {
              return `OpenClaw 节点操作: ${method.substring(5)}`;
            } else if (method.startsWith('chat.')) {
              return `OpenClaw 聊天操作: ${method.substring(5)}`;
            } else {
              return `OpenClaw ${method}`;
            }
          }
          if (parsedQuery) {
            return parsedQuery.length > 100 ? parsedQuery.substring(0, 100) + '...' : parsedQuery;
          }
          if (entry.query) {
            return entry.query.length > 100 ? entry.query.substring(0, 100) + '...' : entry.query;
          }
          return 'OpenClaw 系统操作';
      }

      // 其他类型优先显示用户查询
      if (parsedQuery) {
        return parsedQuery.length > 100 ? parsedQuery.substring(0, 100) + '...' : parsedQuery;
      }

      // 默认显示
      return `${entry.dataType} Request`;
    })();

    return (
      <div key={entry.logID || index} id={`log-entry-${entry.logID || index}`} className="flex items-center gap-3">
        {/* 左侧时间线区域 */}
        <div className="relative flex flex-col items-center w-16">
          {/* 时间线节点 */}
          <motion.div 
            className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-lg transition-all duration-200 ${isExpanded ? 'scale-125' : ''}`}
            style={{ 
              backgroundColor: getDataTypeColor(entry.dataType),
              boxShadow: `0 2px 8px ${getDataTypeColor(entry.dataType)}40`
            }}
            whileHover={{ scale: 1.2 }}
          >
            {getDataTypeIcon(entry.dataType)}
          </motion.div>

          {/* 时间线连接线 */}
          {index < (selectedSession?.allEntries.length || 0) - 1 && (
            <div className={`w-0.5 h-full absolute top-5 left-1/2 transform -translate-x-1/2 ${isDarkMode ? 'bg-gradient-to-b from-gray-600/80 via-gray-700/50 to-gray-800/20' : 'bg-gradient-to-b from-gray-300/80 via-gray-200/50 to-gray-100/20'}`} style={{ height: 'calc(100% + 12px)' }} />
          )}

          {/* 时间标注 */}
          <div className={`mt-0.5 text-[9px] font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {formatTime(entry.sessionCreatedAt || entry.collectTime || '')}
          </div>
        </div>

        {/* 右侧卡片区域 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.02, ease: "easeOut" }}
          className={`flex-1 rounded-xl overflow-hidden transition-all duration-300 backdrop-blur-xl border ${
            isDarkMode 
              ? 'bg-gray-800/40 border-gray-700/50 hover:border-blue-500/30' 
              : 'bg-white/60 border-gray-200/50 hover:border-blue-300'
          }`}
          style={{ boxShadow: isExpanded ? '0 4px 20px rgba(59, 130, 246, 0.15)' : 'none' }}
        >
          <div
            className="p-3 cursor-pointer"
            onClick={() => toggleEntry(entry.logID || '')}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {/* 标题行 */}
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className="font-semibold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap" style={{ backgroundColor: `${getDataTypeColor(entry.dataType)}25`, color: getDataTypeColor(entry.dataType) }}>
                    {highlightKeyword(entry.dataType, searchKeyword)}
                  </span>
                  <h4 className={`text-xs font-semibold truncate flex-1 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {highlightKeyword(isNaturalLanguageMode ? generateNaturalLanguageDescription(entry) : displayTitle, searchKeyword)}
                  </h4>
                  <CopyableLogId id={entry.logID || entry.id} className="ml-1" textClassName={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                </div>

                {/* 缩略内容 */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] leading-tight">
                  {(() => {
                    if (isNaturalLanguageMode) {
                      return (
                        <div className={`flex flex-wrap items-center gap-1.5 leading-tight ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {entry.dataType === 'FILE' ? (
                            <>
                              {entry.pid && <div className="flex items-center gap-1"><span className="font-medium">PID:</span><span>{highlightKeyword(entry.pid, searchKeyword)}</span></div>}
                              {entry.pName && <div className="flex items-center gap-1"><span className="font-medium">进程:</span><span>{highlightKeyword(entry.pName, searchKeyword)}</span></div>}
                              {entry.llmProvider && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">风险:</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${entry.llmProvider === 'HIGH' ? 'bg-red-500/20 text-red-400' : entry.llmProvider === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : entry.llmProvider === 'LOW' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {highlightKeyword(entry.llmProvider, searchKeyword)}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : entry.dataType === 'EXEC' ? (
                            <>
                              {entry.pid && <div className="flex items-center gap-1"><span className="font-medium">PID:</span><span>{highlightKeyword(entry.pid, searchKeyword)}</span></div>}
                              {entry.pName && <div className="flex items-center gap-1"><span className="font-medium">进程:</span><span>{highlightKeyword(entry.pName, searchKeyword)}</span></div>}
                              {entry.llmProvider && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">风险:</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${entry.llmProvider === 'HIGH' ? 'bg-red-500/20 text-red-400' : entry.llmProvider === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : entry.llmProvider === 'LOW' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {highlightKeyword(entry.llmProvider, searchKeyword)}
                                  </span>
                                </div>
                              )}
                              {entry.tokenTotal && <div className="flex items-center gap-1"><span className="font-medium">参数:</span><span>{highlightKeyword(entry.tokenTotal, searchKeyword)}</span></div>}
                            </>
                          ) : (
                            <>
                              {entry.reqIp && entry.reqPort && <div className="flex items-center gap-1"><span className="font-medium">请求:</span><span>{highlightKeyword(`${entry.reqIp}:${entry.reqPort}`, searchKeyword)}</span></div>}
                              {entry.respIp && entry.respPort && <div className="flex items-center gap-1"><span className="font-medium">响应:</span><span>{highlightKeyword(`${entry.respIp}:${entry.respPort}`, searchKeyword)}</span></div>}
                              {entry.pid && <div className="flex items-center gap-1"><span className="font-medium">PID:</span><span>{highlightKeyword(entry.pid, searchKeyword)}</span></div>}
                              {entry.pName && <div className="flex items-center gap-1"><span className="font-medium">进程:</span><span>{highlightKeyword(entry.pName, searchKeyword)}</span></div>}
                              {entry.tokenTotal && parseInt(entry.tokenTotal) > 0 && (
                                <div className="flex items-center gap-1">
                                  <Activity className="w-3 h-3" />
                                  <span>{highlightKeyword(entry.tokenTotal, searchKeyword)} tokens</span>
                                </div>
                              )}
                              {entry.ModelName && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                                  {highlightKeyword(entry.ModelName, searchKeyword)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div className={`flex flex-wrap items-center gap-1.5 leading-tight ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {entry.dataType === 'FILE' ? (
                            <>
                              {entry.pid && <div className="flex items-center gap-1"><span className="font-medium">PID:</span><span>{highlightKeyword(entry.pid, searchKeyword)}</span></div>}
                              {entry.pName && <div className="flex items-center gap-1"><span className="font-medium">进程:</span><span>{highlightKeyword(entry.pName, searchKeyword)}</span></div>}
                              {entry.llmProvider && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">风险:</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${entry.llmProvider === 'HIGH' ? 'bg-red-500/20 text-red-400' : entry.llmProvider === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : entry.llmProvider === 'LOW' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {highlightKeyword(entry.llmProvider, searchKeyword)}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : entry.dataType === 'EXEC' ? (
                            <>
                              {entry.pid && <div className="flex items-center gap-1"><span className="font-medium">PID:</span><span>{highlightKeyword(entry.pid, searchKeyword)}</span></div>}
                              {entry.pName && <div className="flex items-center gap-1"><span className="font-medium">进程:</span><span>{highlightKeyword(entry.pName, searchKeyword)}</span></div>}
                              {entry.llmProvider && (
                                <div className="flex items-center gap-1">
                                  <span className="font-medium">风险:</span>
                                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${entry.llmProvider === 'HIGH' ? 'bg-red-500/20 text-red-400' : entry.llmProvider === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : entry.llmProvider === 'LOW' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    {highlightKeyword(entry.llmProvider, searchKeyword)}
                                  </span>
                                </div>
                              )}
                              {entry.tokenTotal && <div className="flex items-center gap-1"><span className="font-medium">参数:</span><span>{highlightKeyword(entry.tokenTotal, searchKeyword)}</span></div>}
                            </>
                          ) : (
                            <>
                              {entry.reqIp && entry.reqPort && <div className="flex items-center gap-1"><span className="font-medium">请求:</span><span>{highlightKeyword(`${entry.reqIp}:${entry.reqPort}`, searchKeyword)}</span></div>}
                              {entry.respIp && entry.respPort && <div className="flex items-center gap-1"><span className="font-medium">响应:</span><span>{highlightKeyword(`${entry.respIp}:${entry.respPort}`, searchKeyword)}</span></div>}
                              {entry.pid && <div className="flex items-center gap-1"><span className="font-medium">PID:</span><span>{highlightKeyword(entry.pid, searchKeyword)}</span></div>}
                              {entry.pName && <div className="flex items-center gap-1"><span className="font-medium">进程:</span><span>{highlightKeyword(entry.pName, searchKeyword)}</span></div>}
                              {entry.tokenTotal && parseInt(entry.tokenTotal) > 0 && (
                                <div className="flex items-center gap-1">
                                  <Activity className="w-3 h-3" />
                                  <span>{highlightKeyword(entry.tokenTotal, searchKeyword)} tokens</span>
                                </div>
                              )}
                              {entry.ModelName && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                                  {highlightKeyword(entry.ModelName, searchKeyword)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              {/* 展开箭头 */}
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className={isDarkMode ? 'text-gray-500' : 'text-gray-400'}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </div>
          </div>

          {/* 展开详情 */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className={`overflow-hidden border-t ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200'}`}
              >
                {/* 展开的详细信息 - 展示所有实时日志字段 */}
                <div className={`p-4 ${isDarkMode ? 'bg-gray-900/50' : 'bg-gray-50/50'}`}>
                  {/* 详情内容 - 统一对齐和字体 */}
                  <div className="space-y-4">
                    {/* FILE类型日志只显示相关信息 */}
                    {entry.dataType === 'FILE' ? (
                      <>
                        <div className={`rounded-xl p-3 border shadow-sm ${isDarkMode ? 'bg-gray-800/50 border-gray-700/50' : 'bg-white/50 border-gray-200'}`}>
                          <h5 className={`text-xs font-semibold mb-2.5 uppercase tracking-wider ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>基础信息</h5>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>日志ID</label>
                              <div className={`font-mono text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{entry.logID || 'N/A'}</div>
                            </div>
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>数据类型</label>
                              <div className={isDarkMode ? 'text-white' : 'text-gray-900'}>{entry.dataType}</div>
                            </div>
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>会话创建时间</label>
                              <div className={`font-mono text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{entry.sessionCreatedAt}</div>
                            </div>
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>收集时间</label>
                              <div className={`font-mono text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{entry.collectTime}</div>
                            </div>
                          </div>
                        </div>

                        <div className={`rounded-xl p-3 border shadow-sm ${isDarkMode ? 'bg-gray-800/50 border-gray-700/50' : 'bg-white/50 border-gray-200'}`}>
                          <h5 className={`text-xs font-semibold mb-2.5 uppercase tracking-wider ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>文件操作详情</h5>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>文件敏感风险等级</label>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.llmProvider === 'HIGH' ? 'bg-red-500/20 text-red-400' : entry.llmProvider === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' : entry.llmProvider === 'INFO' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                                {entry.llmProvider || 'N/A'}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>访问进程名</label>
                              <div className={`font-mono ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{entry.pName || 'N/A'}</div>
                            </div>
                            <div className="space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>进程ID</label>
                              <div className={isDarkMode ? 'text-white' : 'text-gray-900'}>{entry.pid || 'N/A'}</div>
                            </div>
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>文件路径</label>
                              <div className={`font-mono break-all ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{decodeBase64(entry.answer) || 'N/A'}</div>
                            </div>
                      </div>
                    </div>
                  </>
                ) : entry.dataType === 'EXEC' ? (
                  <>
                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">基础信息</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">日志ID</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.logID || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">数据类型</label>
                          <div className="text-[var(--foreground)]">{entry.dataType}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">会话创建时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.sessionCreatedAt}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">收集时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.collectTime}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">命令执行详情</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">风险等级</label>
                          <span className={`px-2 py-1 rounded-full text-xs ${entry.llmProvider === 'HIGH' ? 'bg-red-100 text-red-800' : entry.llmProvider === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' : entry.llmProvider === 'INFO' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                            {entry.llmProvider || 'N/A'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程名</label>
                          <div className="text-[var(--foreground)] font-mono">{entry.pName || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程ID</label>
                          <div className="text-[var(--foreground)]">{entry.pid || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">参数数量 (argc)</label>
                          <div className="text-[var(--foreground)]">{entry.tokenTotal || 'N/A'}</div>
                        </div>
                      </div>
                    </div>

                    {(entry.parsedQuery || entry.query) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">执行命令</h5>
                        <div className="bg-[var(--background)] p-3 rounded-lg">
                          <pre className="text-[var(--foreground)] font-mono text-xs whitespace-pre-wrap break-all">{entry.parsedQuery || entry.query}</pre>
                        </div>
                      </div>
                    )}

                    {entry.answer && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">可执行文件路径</h5>
                        <div className="flex items-center gap-2 bg-[var(--background)] p-3 rounded-lg">
                          <span className="text-base">📁</span>
                          <div className="text-[var(--foreground)] font-mono text-xs break-all">{decodeBase64(entry.answer)}</div>
                        </div>
                      </div>
                    )}
                  </>
                ) : entry.dataType === 'OPENCLAW' ? (
                  <>
                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">基础信息</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">日志ID</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.logID || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">数据类型</label>
                          <div className="text-[var(--foreground)]">{entry.dataType}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">会话创建时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.sessionCreatedAt}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">会话结束时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.sessionEndedAt || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">收集时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.collectTime}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程ID</label>
                          <div className="text-[var(--foreground)]">{entry.pid || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程名</label>
                          <div className="text-[var(--foreground)] font-mono">{entry.pName || 'N/A'}</div>
                        </div>
                      </div>
                    </div>

                    {/* 网络信息 */}
                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">网络信息</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">请求IP:Port</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.reqIp}:{entry.reqPort}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">响应IP:Port</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.respIp}:{entry.respPort}</div>
                        </div>
                      </div>
                    </div>

                    {/* 会话信息 */}
                    {entry.session && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">会话信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">会话ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.session || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">消息ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.messageID || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Agent信息 */}
                    {entry.agentID && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">Agent信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">Agent ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.agentID || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">Agent名称</label>
                            <div className="text-[var(--foreground)]">{entry.agentName || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* LLM相关信息 */}
                    {(entry.ModelName || entry.llmProvider || entry.llmVersion || entry.llmStream) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">LLM相关</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">模型名称</label>
                            <div className="text-[var(--foreground)]">{entry.ModelName || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM提供商</label>
                            <div className="text-[var(--foreground)]">{entry.llmProvider || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">API版本</label>
                            <div className="text-[var(--foreground)]">{entry.llmVersion || 'N/A'}</div>
                          </div>
                          {entry.dataType === 'OPENCLAW' && (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">执行结果</label>
                              <div className="text-[var(--foreground)]">{entry.llmStream === '1' ? '操作失败' : '操作成功'}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Token相关信息 */}
                    {(entry.tokenTotal || entry.tokenPrompt || entry.tokenCompletion) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">Token信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">总Token</label>
                            <div className="text-[var(--foreground)]">{entry.tokenTotal || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">提示词Token</label>
                            <div className="text-[var(--foreground)]">{entry.tokenPrompt || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">生成Token</label>
                            <div className="text-[var(--foreground)]">{entry.tokenCompletion || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 工具使用 */}
                    {entry.toolName && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">工具使用</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">工具名称</label>
                            <div className="text-[var(--foreground)]">{entry.toolName}</div>
                          </div>
                          {entry.toolInput && (
                            <div className="col-span-3 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">工具输入</label>
                              <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2 rounded-lg overflow-x-auto">
                                {decodeBase64(entry.toolInput)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 对话内容 */}
                    {(entry.parsedQuery || entry.query || entry.parsedAnswer || entry.answer || entry.thought) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">对话内容</h5>
                        {(entry.parsedQuery || entry.query) && (
                          <div className="mb-3">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">用户提问</label>
                            <div className="text-[var(--foreground)] bg-[var(--background)] p-2 rounded-lg whitespace-pre-wrap text-xs">
                              {entry.parsedQuery || decodeBase64(entry.query)}
                            </div>
                          </div>
                        )}
                        {entry.thought && (
                          <div className="mb-3">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">思考过程</label>
                            <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2 rounded-lg overflow-x-auto max-h-40">
                              {decodeBase64(entry.thought)}
                            </pre>
                          </div>
                        )}
                        {(entry.parsedAnswer || entry.answer) && (
                          <div>
                            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">AI回答</label>
                            <div className="text-[var(--foreground)] bg-[var(--background)] p-2 rounded-lg whitespace-pre-wrap text-xs">
                              {entry.parsedAnswer || decodeBase64(entry.answer)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Payload信息 */}
                    {(entry.parsedReqPayload || entry.reqPayload || entry.parsedRspPayload || entry.rspPayload) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">Payload信息</h5>
                        {(entry.parsedReqPayload || entry.reqPayload) && (
                          <div className="mb-3">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">请求Payload</label>
                            <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2 rounded-lg overflow-x-auto max-h-40">
                              {entry.parsedReqPayload || decodeBase64(entry.reqPayload)}
                            </pre>
                          </div>
                        )}
                        {(entry.parsedRspPayload || entry.rspPayload) && (
                          <div>
                            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">响应Payload</label>
                            <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2 rounded-lg overflow-x-auto max-h-40">
                              {entry.parsedRspPayload || decodeBase64(entry.rspPayload)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* 基础信息 */}
                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">基础信息</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">日志ID</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.logID || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">数据类型</label>
                          <div className="text-[var(--foreground)]">{entry.dataType}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">会话创建时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.sessionCreatedAt}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">会话结束时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.sessionEndedAt || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">收集时间</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.collectTime}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程ID</label>
                          <div className="text-[var(--foreground)]">{entry.pid || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程名</label>
                          <div className="text-[var(--foreground)]">{entry.pName || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">Dify版本</label>
                          <div className="text-[var(--foreground)]">{entry.difyVersion || 'N/A'}</div>
                        </div>
                      </div>
                    </div>

                    {/* 网络信息 */}
                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">网络信息</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">请求IP:Port</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.reqIp}:{entry.reqPort}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">响应IP:Port</label>
                          <div className="text-[var(--foreground)] font-mono text-xs">{entry.respIp}:{entry.respPort}</div>
                        </div>
                      </div>
                    </div>

                    {/* 会话信息 */}
                    {entry.session && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">会话信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">会话ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.session || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">消息ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.messageID || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Agent/工作流信息 */}
                    {(entry.agentID || entry.agentName || entry.workflowStatus || entry.workflowTotalSteps) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">Agent/工作流信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">Agent ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.agentID || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">Agent名称</label>
                            <div className="text-[var(--foreground)]">{entry.agentName || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">工作流状态</label>
                            <div className="text-[var(--foreground)]">{entry.workflowStatus || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">工作流总步骤</label>
                            <div className="text-[var(--foreground)]">{entry.workflowTotalSteps || 'N/A'}</div>
                          </div>
                          {entry.workflowNodes && (
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">工作流节点</label>
                              <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto">
                                {entry.workflowNodes}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* LLM相关信息 */}
                    {(entry.ModelName || entry.llmProvider || entry.llmID || entry.llmModel) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">LLM相关</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">模型名称</label>
                            <div className="text-[var(--foreground)]">{entry.ModelName || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM模型</label>
                            <div className="text-[var(--foreground)]">{entry.llmModel || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM提供商</label>
                            <div className="text-[var(--foreground)]">{entry.llmProvider || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM版本</label>
                            <div className="text-[var(--foreground)]">{entry.llmVersion || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.llmID || 'N/A'}</div>
                          </div>
                          {entry.dataType === 'OPENCLAW' && (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">执行结果</label>
                              <div className="text-[var(--foreground)]">{entry.llmStream === '1' ? '操作失败' : '操作成功'}</div>
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM轮数</label>
                            <div className="text-[var(--foreground)]">{entry.llmRound || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM总Token</label>
                            <div className="text-[var(--foreground)]">{entry.llmTokenTotal || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Token相关信息 */}
                    {(entry.tokenTotal || entry.historyTokenTotal) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">Token信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">本轮总Token</label>
                            <div className="text-[var(--foreground)]">{entry.tokenTotal || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">本轮提示词Token</label>
                            <div className="text-[var(--foreground)]">{entry.tokenPrompt || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">本轮生成Token</label>
                            <div className="text-[var(--foreground)]">{entry.tokenCompletion || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">历史总Token</label>
                            <div className="text-[var(--foreground)]">{entry.historyTokenTotal || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">历史提示词Token</label>
                            <div className="text-[var(--foreground)]">{entry.historyTokenPrompt || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">历史生成Token</label>
                            <div className="text-[var(--foreground)]">{entry.historyTokenCompletion || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 延迟相关信息 */}
                    {(entry.latency || entry.historyLatency) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">延迟信息</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">本轮延迟</label>
                            <div className="text-[var(--foreground)]">{entry.latency || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">历史总延迟</label>
                            <div className="text-[var(--foreground)]">{entry.historyLatency || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">平均延迟</label>
                            <div className="text-[var(--foreground)]">{entry.historyAverageLatency || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">历史轮数</label>
                            <div className="text-[var(--foreground)]">{entry.historyRound || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* RAG相关信息 */}
                    {(entry.ragHitCount || entry.ragScore || entry.ragDataset) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">RAG相关</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">命中次数</label>
                            <div className="text-[var(--foreground)]">{entry.ragHitCount || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">相似度得分</label>
                            <div className="text-[var(--foreground)]">{entry.ragScore || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">词数</label>
                            <div className="text-[var(--foreground)]">{entry.ragWordCount || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">片段位置</label>
                            <div className="text-[var(--foreground)]">{entry.ragSegPos || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">数据集</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.ragDataset || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">文档类型</label>
                            <div className="text-[var(--foreground)]">{entry.ragDataType || 'N/A'}</div>
                          </div>
                          {entry.ragDocument && (
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">文档名称</label>
                              <div className="text-[var(--foreground)] font-mono text-xs">{entry.ragDocument}</div>
                            </div>
                          )}
                          {entry.ragContent && (
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">文档内容片段</label>
                              <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto max-h-40">
                                {entry.ragContent}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* MCP相关信息 */}
                    {(entry.mcpMethod || entry.mcpClientName || entry.mcpServerName) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">MCP相关</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">MCP方法</label>
                            <div className="text-[var(--foreground)]">{entry.mcpMethod || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">客户端名称</label>
                            <div className="text-[var(--foreground)]">{entry.mcpClientName || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">客户端版本</label>
                            <div className="text-[var(--foreground)]">{entry.mcpClientVersion || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">服务器名称</label>
                            <div className="text-[var(--foreground)]">{entry.mcpServerName || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">服务器版本</label>
                            <div className="text-[var(--foreground)]">{entry.mcpServerVersion || 'N/A'}</div>
                          </div>
                          {entry.mcpToolName && (
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">工具名称</label>
                              <div className="text-[var(--foreground)]">{entry.mcpToolName}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 查询和回答 */}
                    {(entry.parsedQuery || entry.parsedAnswer || entry.llmQuery || entry.llmAnswer) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">对话内容</h5>
                        {(entry.parsedQuery || entry.llmQuery) && (
                          <div className="mb-3.5 space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">查询</label>
                            <div className="text-xs bg-[var(--background)] p-2.5 rounded-lg">
                              {entry.llmQuery || entry.parsedQuery}
                            </div>
                          </div>
                        )}
                        {(entry.parsedAnswer || entry.llmAnswer) && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">回答</label>
                            <div className="text-xs bg-[var(--background)] p-2.5 rounded-lg">
                              {entry.llmAnswer || entry.parsedAnswer}
                            </div>
                          </div>
                        )}
                        {entry.thought && (
                          <div className="mt-3.5 space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">思考过程</label>
                            <pre className="text-xs font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto max-h-40">
                              {entry.thought}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 工具使用 */}
                    {(entry.toolName || entry.mcpToolName) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">工具使用</h5>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">工具名称</label>
                            <div className="text-[var(--foreground)]">{entry.toolName || entry.mcpToolName}</div>
                          </div>
                          {entry.toolInput && (
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">工具输入</label>
                              <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto">
                                {entry.toolInput}
                              </pre>
                            </div>
                          )}
                          {entry.mcpToolInput && (
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">MCP工具输入</label>
                              <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto">
                                {entry.mcpToolInput}
                              </pre>
                            </div>
                          )}
                          {entry.mcpAnswer && (
                            <div className="col-span-1 md:col-span-4 space-y-1">
                              <label className="text-xs font-medium text-[var(--text-secondary)] block">MCP工具回答</label>
                              <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto">
                                {entry.mcpAnswer}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Payload信息 */}
                    <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">Payload信息</h5>
                      {entry.parsedReqPayload && (
                        <div className="mb-3.5 space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">Request Payload</label>
                          <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto max-h-70">
                            {entry.parsedReqPayload}
                          </pre>
                        </div>
                      )}
                      {entry.parsedRspPayload && (
                        <div className="space-y-1">
                          <label className={`text-xs font-medium block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Response Payload</label>
                          <pre className={`font-mono text-xs p-2.5 rounded-lg overflow-x-auto max-h-70 ${isDarkMode ? 'text-white bg-gray-900/50' : 'text-gray-900 bg-gray-100'}`}>
                            {entry.parsedRspPayload}
                          </pre>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-4 pt-4 border-t border-[var(--border-color)]/30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldPlus className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        快速创建防护规则
                      </span>
                    </div>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      选择规则类型
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {ruleTypeButtons.map((btn, idx) => {
                      const IconComponent = btn.icon;
                      const borderColor = btn.color === 'red' 
                        ? (isDarkMode ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.3)')
                        : btn.color === 'orange' 
                          ? (isDarkMode ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.3)')
                          : (isDarkMode ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.3)');
                      const hoverBorderColor = btn.color === 'red' 
                        ? (isDarkMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.5)')
                        : btn.color === 'orange' 
                          ? (isDarkMode ? 'rgba(249, 115, 22, 0.4)' : 'rgba(249, 115, 22, 0.5)')
                          : (isDarkMode ? 'rgba(234, 179, 8, 0.4)' : 'rgba(234, 179, 8, 0.5)');
                      const textColor = btn.color === 'red' 
                        ? (isDarkMode ? '#f87171' : '#dc2626')
                        : btn.color === 'orange' 
                          ? (isDarkMode ? '#fb923c' : '#ea580c')
                          : (isDarkMode ? '#fbbf24' : '#ca8a04');
                      
                      return (
                        <motion.button
                          key={btn.type}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateProtectionRule(entry, btn.type);
                          }}
                          className="group relative flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl font-medium text-xs overflow-hidden transition-all duration-300"
                          style={{
                            background: isDarkMode 
                              ? `linear-gradient(135deg, ${btn.color === 'red' ? 'rgba(239, 68, 68, 0.1)' : btn.color === 'orange' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(234, 179, 8, 0.1)'}, ${btn.color === 'red' ? 'rgba(239, 68, 68, 0.05)' : btn.color === 'orange' ? 'rgba(249, 115, 22, 0.05)' : 'rgba(234, 179, 8, 0.05)'})`
                              : `linear-gradient(135deg, ${btn.color === 'red' ? 'rgba(239, 68, 68, 0.08)' : btn.color === 'orange' ? 'rgba(249, 115, 22, 0.08)' : 'rgba(234, 179, 8, 0.08)'}, transparent)`,
                            border: `1px solid ${borderColor}`,
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 + idx * 0.05 }}
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <motion.div
                            className={`p-1.5 rounded-lg bg-gradient-to-br ${btn.gradient} shadow-lg`}
                            style={{ boxShadow: `0 4px 12px ${btn.color === 'red' ? 'rgba(239, 68, 68, 0.3)' : btn.color === 'orange' ? 'rgba(249, 115, 22, 0.3)' : 'rgba(234, 179, 8, 0.3)'}` }}
                            whileHover={{ rotate: [0, -5, 5, 0] }}
                            transition={{ duration: 0.3 }}
                          >
                            <IconComponent className="w-4 h-4 text-white" />
                          </motion.div>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-bold" style={{ color: textColor }}>
                              {btn.label}
                            </span>
                            <span className={`text-[9px] font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {btn.subLabel}
                            </span>
                          </div>
                          <motion.div
                            className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                            style={{
                              background: `radial-gradient(circle at center, ${btn.color === 'red' ? 'rgba(239, 68, 68, 0.1)' : btn.color === 'orange' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(234, 179, 8, 0.1)'}, transparent)`,
                              border: `1px solid ${hoverBorderColor}`,
                            }}
                          />
                        </motion.button>
                      );
                    })}
                  </div>
                  
                  <p className={`text-center text-[10px] mt-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    基于当前话单内容自动生成安全防护规则
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};



  // 渲染会话摘要卡片
  const renderSessionSummary = () => {
    if (!selectedSession) return null;

    const entries = selectedSession.allEntries;
    const totalEntries = entries.length;
    const entryTypes = [...new Set(entries.map(e => e.dataType))];
    const hasHighRisk = entries.some(e => e.llmProvider === 'HIGH');
    const hasMediumRisk = entries.some(e => e.llmProvider === 'MEDIUM');

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
      >
        {/* 会话概览卡片 */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          transition={{ duration: 0.2 }}
          className={`p-5 rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
            isDarkMode 
              ? 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40' 
              : 'bg-blue-50/80 border-blue-200 hover:border-blue-300'
          }`}
          style={{ boxShadow: '0 4px 20px rgba(59, 130, 246, 0.15)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className={`text-sm font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>会话概览</h3>
              <p className={`text-xs leading-tight ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>完整调用链分析</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>会话ID</span>
              <span className={`text-xs font-semibold font-mono ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedSession.mainEntry.logID}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>时间范围</span>
              <span className={`text-xs font-semibold whitespace-nowrap ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {formatTime(selectedSession.startTime.toString())} - {formatTime(selectedSession.endTime.toString())}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>总条目数</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">{totalEntries}</span>
            </div>
          </div>
        </motion.div>

        {/* 类型分布卡片 */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          transition={{ duration: 0.2 }}
          className={`p-5 rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
            isDarkMode 
              ? 'bg-purple-500/10 border-purple-500/20 hover:border-purple-500/40' 
              : 'bg-purple-50/80 border-purple-200 hover:border-purple-300'
          }`}
          style={{ boxShadow: '0 4px 20px rgba(139, 92, 246, 0.15)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg shadow-purple-500/25">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className={`text-sm font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>类型分布</h3>
              <p className={`text-xs leading-tight ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>调用类型统计</p>
            </div>
          </div>
          <div className="space-y-2">
            {entryTypes.slice(0, 4).map(type => {
              const count = entries.filter(e => e.dataType === type).length;
              return (
                <div key={type} className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getDataTypeColor(type) }} />
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{count}</span>
                  </div>
                </div>
              );
            })}
            {entryTypes.length > 4 && (
              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                +{entryTypes.length - 4} 更多类型
              </div>
            )}
          </div>
        </motion.div>

        {/* 风险评估卡片 */}
        <motion.div
          whileHover={{ y: -4, scale: 1.01 }}
          transition={{ duration: 0.2 }}
          className={`p-5 rounded-2xl backdrop-blur-xl border transition-all duration-300 ${
            hasHighRisk 
              ? isDarkMode ? 'bg-red-500/10 border-red-500/20 hover:border-red-500/40' : 'bg-red-50/80 border-red-200 hover:border-red-300'
              : hasMediumRisk 
                ? isDarkMode ? 'bg-yellow-500/10 border-yellow-500/20 hover:border-yellow-500/40' : 'bg-yellow-50/80 border-yellow-200 hover:border-yellow-300'
                : isDarkMode ? 'bg-green-500/10 border-green-500/20 hover:border-green-500/40' : 'bg-green-50/80 border-green-200 hover:border-green-300'
          }`}
          style={{ boxShadow: hasHighRisk ? '0 4px 20px rgba(239, 68, 68, 0.15)' : hasMediumRisk ? '0 4px 20px rgba(234, 179, 8, 0.15)' : '0 4px 20px rgba(34, 197, 94, 0.15)' }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2.5 rounded-xl shadow-lg ${
              hasHighRisk 
                ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-red-500/25' 
                : hasMediumRisk 
                  ? 'bg-gradient-to-br from-yellow-500 to-amber-600 shadow-yellow-500/25' 
                  : 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/25'
            }`}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className={`text-sm font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>风险评估</h3>
              <p className={`text-xs leading-tight ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>会话安全分析</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>高风险</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className={`text-xs font-semibold ${hasHighRisk ? 'text-red-400' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {entries.filter(e => e.llmProvider === 'HIGH').length}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>中风险</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className={`text-xs font-semibold ${hasMediumRisk ? 'text-yellow-400' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {entries.filter(e => e.llmProvider === 'MEDIUM').length}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>低风险</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {entries.filter(e => e.llmProvider === 'LOW').length}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl p-6 min-h-[600px] backdrop-blur-2xl border transition-all duration-300 ${
        isDarkMode 
          ? 'bg-gray-800/40 border-gray-700/50 shadow-xl shadow-black/20' 
          : 'bg-white/60 border-gray-200/50 shadow-xl shadow-gray-200/50'
      }`}
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
    >
      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <motion.div 
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ duration: 0.2 }}
            >
              <LayoutDashboard className="w-5 h-5 text-white" />
            </motion.div>
            <h3 className={`text-xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>会话级全景分析</h3>
          </div>
          <div className={`flex items-center gap-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>会话已聚合展示</span>
            </div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>全景展示会话关系</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                共 {aggregatedSessions.length} 个会话
              </span>
            </div>
          </div>
        </div>

        {/* 会话选择器 - 带搜索功能 */}
        <div className="mt-4 md:mt-0 relative" ref={filterMenuRef}>
          <label className={`block text-xs font-semibold mb-2 uppercase tracking-wider ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>选择会话</label>
          <div className="relative">
            {/* 选择按钮 */}
            <button
              className={`w-full md:w-115 flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all duration-300 backdrop-blur-xl border cursor-pointer ${
                isDarkMode 
                  ? 'bg-gray-800/60 border-gray-700/50 text-white hover:bg-gray-700/60 hover:border-blue-500/30' 
                  : 'bg-white/60 border-gray-200/50 text-gray-900 hover:bg-white/80 hover:border-blue-300'
              }`}
              onClick={() => setIsSessionDropdownOpen(!isSessionDropdownOpen)}
            >
              {selectedSession ? (
                <div className="flex items-center gap-2 truncate">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold shrink-0 ${
                    selectedSession.mainEntry.dataType === 'AG-UI' 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'bg-purple-500/20 text-purple-400'
                  }`}>
                    {selectedSession.mainEntry.dataType}
                  </span>
                  <span className="font-medium truncate">{selectedSession.mainEntry.logID}</span>
                </div>
              ) : (
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>请选择会话</span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 shrink-0 ml-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} ${isSessionDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 下拉菜单 */}
            <AnimatePresence>
              {isSessionDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`absolute left-0 mt-2 w-full md:w-115 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-2xl border ${
                    isDarkMode 
                      ? 'bg-gray-800/95 border-gray-700/50' 
                      : 'bg-white/95 border-gray-200'
                  }`}
                >
                  {/* 搜索输入框 */}
                  <div className={`p-3 border-b ${isDarkMode ? 'border-gray-700/50' : 'border-gray-200'}`}>
                    <input
                      type="text"
                      placeholder="搜索会话ID..."
                      className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                        isDarkMode 
                          ? 'bg-gray-900/50 border-gray-700/50 text-white placeholder-gray-500' 
                          : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                      }`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* 会话列表 */}
                  <div className="max-h-80 overflow-y-auto p-2">
                    {filteredSessions.length === 0 ? (
                      <div className={`text-center text-sm py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
                              <span>{formatTime(session.startTime.toString())} - {formatTime(session.endTime.toString())}</span>
                              <span>·</span>
                              <span>{session.allEntries.length} 个条目</span>
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
            <Trees className="w-14 h-14 text-[var(--accent-blue)]" />
          </div>
          <h4 className="text-xl font-semibold text-[var(--foreground)] mb-3 tracking-tight">暂无会话数据</h4>
          <p className="text-[var(--text-secondary)] max-w-md leading-relaxed">
            当有AG-UI会话产生时，将自动展示完整的会话流程和详细信息。
          </p>
        </motion.div>
      ) : selectedSession ? (
        <div className="relative">
          {/* 会话摘要卡片 */}
          {renderSessionSummary()}

          {/* 关系拓扑图 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8"
          >
            <div className="rounded-2xl bg-[var(--card-background)] border border-[var(--border-color)] overflow-hidden">
              <div className="relative" style={{ minHeight: '500px' }}>
                <div className="absolute top-4 left-4 z-10">
                  <h4 className="text-lg font-bold text-[var(--foreground)] mb-1">会话全景拓扑图</h4>
                  <p className="text-xs text-[var(--text-secondary)]">展示当前会话中所有关联话单的关系信息</p>
                </div>
                <div className="w-full h-[500px]">
                  <TopologyGraph session={selectedSession} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* 启发式分析结果 */}
          {analysisResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="mb-8"
            >
              <div className="rounded-2xl bg-gradient-to-br from-[var(--card-background)] to-[var(--background)] border border-[var(--border-color)] overflow-hidden shadow-sm">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-[var(--foreground)]">启发式分析</h4>
                        <p className="text-xs text-[var(--text-secondary)]">检测到 {analysisResults.length} 个潜在问题，点击问题卡片查看详情</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {analysisResults.map((result, index) => (
                      <motion.div
                        key={result.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        className={`group relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 cursor-pointer hover:shadow-md ${
                          result.severity === 'high' 
                            ? 'bg-red-500/5 border-red-500/20' 
                            : result.severity === 'medium'
                            ? 'bg-orange-500/5 border-orange-500/20'
                            : result.severity === 'low'
                            ? 'bg-yellow-500/5 border-yellow-500/20'
                            : 'bg-green-500/5 border-green-500/20'
                        }`}
                        onClick={() => {
                          if (result.affectedEntries.length > 0) {
                            const entryIds = result.affectedEntries.map(e => e.logID).filter(Boolean);
                            if (entryIds.length > 0) {
                              setExpandedEntries(prev => {
                                const newSet = new Set(prev);
                                entryIds.forEach(id => newSet.add(id));
                                return newSet;
                              });
                              setTimeout(() => {
                                const firstEntryId = entryIds[0];
                                if (firstEntryId) {
                                  const element = document.getElementById(`log-entry-${firstEntryId}`);
                                  if (element) {
                                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  }
                                }
                              }, 100);
                            }
                          }
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                            result.severity === 'high' 
                              ? 'bg-red-500/10' 
                              : result.severity === 'medium'
                              ? 'bg-orange-500/10'
                              : result.severity === 'low'
                              ? 'bg-yellow-500/10'
                              : 'bg-green-500/10'
                          }`}>
                            {result.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h5 className="text-sm font-bold text-[var(--foreground)]">{result.title}</h5>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                result.severity === 'high' 
                                  ? 'bg-red-500 text-white' 
                                  : result.severity === 'medium'
                                  ? 'bg-orange-500 text-white'
                                  : result.severity === 'low'
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-green-500 text-white'
                              }`}>
                                {result.severity === 'high' ? '高风险' : result.severity === 'medium' ? '中风险' : result.severity === 'low' ? '低风险' : '信息'}
                              </span>
                              {result.riskScore > 0 && (
                                <span className="text-[10px] text-[var(--text-secondary)]">风险分: {result.riskScore}</span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mb-2">{result.description}</p>
                            
                            {result.affectedEntries.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <FileText className="w-3 h-3 text-[var(--accent-blue)]" />
                                <span className="text-xs text-[var(--text-secondary)]">影响</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {result.affectedEntries.slice(0, 5).map((entry, idx) => (
                                    <span 
                                      key={entry.logID || idx}
                                      className="px-2 py-1 rounded-full text-[10px] font-mono border transition-all duration-200 cursor-pointer hover:scale-105"
                                      style={{
                                        backgroundColor: `${getDataTypeColor(entry.dataType)}20`,
                                        borderColor: `${getDataTypeColor(entry.dataType)}40`
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedEntries(prev => {
                                          const newSet = new Set(prev);
                                          if (newSet.has(entry.logID || '')) {
                                            newSet.delete(entry.logID || '');
                                          } else {
                                            newSet.add(entry.logID || '');
                                          }
                                          return newSet;
                                        });
                                        setTimeout(() => {
                                          const element = document.getElementById(`log-entry-${entry.logID}`);
                                          if (element) {
                                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }
                                        }, 100);
                                      }}
                                    >
                                      {entry.logID?.slice(-8) || 'N/A'}
                                    </span>
                                  ))}
                                  {result.affectedEntries.length > 5 && (
                                    <span className="px-2 py-1 rounded-full text-[10px] font-mono bg-[var(--background)]/50 border border-[var(--border-color)]/30">
                                      +{result.affectedEntries.length - 5}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0.5 rounded-full transition-all duration-300 group-hover:w-3/4 ${
                          result.severity === 'high' 
                            ? 'bg-red-500' 
                            : result.severity === 'medium'
                            ? 'bg-orange-500'
                            : result.severity === 'low'
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* 话单类型统计标签 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mb-8"
          >
            <div className="rounded-2xl bg-gradient-to-br from-[var(--card-background)] to-[var(--background)] border border-[var(--border-color)] overflow-hidden shadow-sm">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent-blue)]/20 to-purple-500/20 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-[var(--accent-blue)]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-[var(--foreground)]">话单类型统计</h4>
                    <p className="text-xs text-[var(--text-secondary)]">当前会话中各类型话单分布</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-3 mb-4">
                  {(() => {
                    const typeCounts = selectedSession.allEntries.reduce((acc, entry) => {
                      acc[entry.dataType] = (acc[entry.dataType] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);
                    
                    const totalCount = selectedSession.allEntries.length;
                    const typeOrder = ['AG-UI', 'HTTP', 'LLM', 'AGENT', 'RAG', 'MCP', 'FILE', 'EXEC', 'OPENCLAW', 'UNKNOWN'];
                    
                    const allTypes = ['全部', ...typeOrder];
                    
                    return allTypes.map((type, index) => {
                      const count = type === '全部' ? totalCount : (typeCounts[type] || 0);
                      if (count === 0 && type !== '全部') return null;
                      
                      const color = type === '全部' ? 'var(--accent-blue)' : getDataTypeColor(type);
                      const bgColor = `${color}15`;
                      const borderColor = `${color}30`;
                      
                      return (
                          <motion.div
                            key={type}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
                            whileHover={{ scale: 1.05, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            className="group relative px-4 py-2.5 rounded-xl border backdrop-blur-sm transition-all duration-300 cursor-pointer"
                            style={{
                              backgroundColor: bgColor,
                              borderColor: borderColor
                            }}
                            onClick={() => onTypeFilterClick && onTypeFilterClick(type)}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                              <span className="text-xs font-semibold text-[var(--foreground)]">{type}</span>
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white transition-all duration-300" style={{ backgroundColor: color }}>
                                {count}
                              </span>
                            </div>
                            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0.5 rounded-full transition-all duration-300 group-hover:w-3/4" style={{ backgroundColor: color }} />
                          </motion.div>
                        );
                    }).filter(Boolean);
                  })()}
                </div>

                {(() => {
                  const fileAndExecEntries = selectedSession.allEntries.filter(e => e.dataType === 'FILE' || e.dataType === 'EXEC');
                  if (fileAndExecEntries.length === 0) return null;

                  const riskCounts = fileAndExecEntries.reduce((acc, entry) => {
                    const risk = entry.llmProvider || 'UNKNOWN';
                    acc[risk] = (acc[risk] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>);

                  const riskOrder = ['HIGH', 'MEDIUM', 'LOW', 'INFO'];
                  const riskColors = {
                    'HIGH': '#ef4444',
                    'MEDIUM': '#f59e0b',
                    'LOW': '#22c55e',
                    'INFO': '#3b82f6'
                  };
                  const riskLabels = {
                    'HIGH': '高风险',
                    'MEDIUM': '中风险',
                    'LOW': '低风险',
                    'INFO': '信息'
                  };

                  return (
                    <div className="mt-4 pt-4 border-t border-[var(--border-color)]/30">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-red-500/20 to-green-500/20 flex items-center justify-center">
                          <Shield className="w-3 h-3 text-[var(--foreground)]" />
                        </div>
                        <div>
                          <h5 className="text-xs font-semibold text-[var(--foreground)]">FILE/EXEC 风险等级分布</h5>
                          <p className="text-[10px] text-[var(--text-secondary)]">文件操作和命令执行风险等级统计</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {riskOrder.map(risk => {
                          const count = riskCounts[risk] || 0;
                          if (count === 0) return null;
                          
                          const color = riskColors[risk as keyof typeof riskColors];
                          const bgColor = `${color}15`;
                          const borderColor = `${color}30`;
                          
                          return (
                            <motion.div
                              key={risk}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ duration: 0.3, delay: 0.3 + riskOrder.indexOf(risk) * 0.05 }}
                              whileHover={{ scale: 1.05, y: -2 }}
                              whileTap={{ scale: 0.95 }}
                              className="group relative px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-all duration-300 cursor-pointer"
                              style={{
                                backgroundColor: bgColor,
                                borderColor: borderColor
                              }}
                              onClick={() => onTypeFilterClick && onTypeFilterClick(risk)}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full shadow-sm" style={{ backgroundColor: color }} />
                                <span className="text-[10px] font-semibold text-[var(--foreground)]">{riskLabels[risk as keyof typeof riskLabels]}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white transition-all duration-300" style={{ backgroundColor: color }}>
                                  {count}
                                </span>
                              </div>
                              <div className="absolute -bottom-0.5 left-1/2 transform -translate-x-1/2 w-0 h-0.5 rounded-full transition-all duration-300 group-hover:w-3/4" style={{ backgroundColor: color }} />
                            </motion.div>
                          );
                        }).filter(Boolean)}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </motion.div>

          {/* 日志条目时间线 */}
          <div className="">
            {selectedSession.allEntries.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[var(--text-secondary)]">该会话暂无相关条目</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedSession.allEntries
                  .sort((a, b) => {
                    const aTime = new Date(a.sessionCreatedAt || a.collectTime).getTime();
                    const bTime = new Date(b.sessionCreatedAt || b.collectTime).getTime();
                    // 确保早发生的在上面，晚发生的在下面（升序排序）
                    return aTime - bTime;
                  })
                  .map((entry, index) => renderLogEntry(entry, index))}
              </div>
            )}
          </div>

          {/* 图例和模式切换 */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-5 bg-[var(--background)]/50 rounded-lg p-4 border border-[var(--border-color)]/30 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <Info className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
              <span>点击条目展开查看详细信息，支持风险等级快速识别</span>
            </div>
            
            {/* 模式切换按钮 */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--text-secondary)]">展示模式：</span>
              <div className="flex bg-[var(--border-color)]/20 rounded-lg p-0.5">
                <button
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${isNaturalLanguageMode ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
                  onClick={() => setIsNaturalLanguageMode(true)}
                >
                  自然语言
                </button>
                <button
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${!isNaturalLanguageMode ? 'bg-[var(--accent-blue)] text-white font-medium' : 'text-[var(--text-secondary)] hover:text-[var(--foreground)]'}`}
                  onClick={() => setIsNaturalLanguageMode(false)}
                >
                  原始字段
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}
