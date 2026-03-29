'use client';

import { motion } from 'framer-motion';
import { Trees, ChevronDown, ChevronUp, Clock, Activity, BarChart3, Shield, Server, Database, Package, User, HelpCircle, Layers, Cpu } from 'lucide-react';
import { useState, useMemo } from 'react';
import { ParsedLogEntry } from '@/types/log';
import { getDataTypeColor, getDataTypeIcon, getRiskLevelBgClass } from '@/lib/logParser';
import { CopyableLogId } from '@/components/CopyableLogId';

interface ProcessTreeViewProps {
  logs: ParsedLogEntry[];
  searchKeyword?: string;
  filteredProcessTypes?: { [key: string]: boolean };
  filteredLogTypes?: { [key: string]: boolean };
}

interface ProcessNode {
  pid: string;
  entries: ParsedLogEntry[];
  startTime: Date;
  endTime: Date;
  pName: string;
  entryTypes: string[];
  totalEntries: number;
  category: 'system' | 'python' | 'llm' | 'agent' | 'web' | 'database' | 'container' | 'user' | 'other';
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

export function ProcessTreeView({ logs, searchKeyword = '', filteredProcessTypes = {}, filteredLogTypes = {} }: ProcessTreeViewProps) {
  const [expandedPids, setExpandedPids] = useState<Set<string>>(new Set());
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  
  // 核心辅助函数，必须在使用前定义
  const getCategoryName = (category: ProcessNode['category']) => {
    switch (category) {
      case 'system': return '系统服务';
      case 'python': return '运行脚本';
      case 'llm': return 'LLM服务';
      case 'agent': return 'Agent服务';
      case 'web': return 'Web服务';
      case 'database': return '数据库服务';
      case 'container': return '容器服务';
      case 'user': return '用户进程';
      case 'other': return '其他进程';
      default: return '其他进程';
    }
  };
  
  const getCategoryColor = (category: ProcessNode['category']) => {
    switch (category) {
      case 'system': return 'rgb(59, 130, 246)';
      case 'python': return 'rgb(139, 92, 246)';
      case 'llm': return 'rgb(139, 92, 246)';
      case 'agent': return 'rgb(236, 72, 153)';
      case 'web': return 'rgb(245, 158, 11)';
      case 'database': return 'rgb(16, 185, 129)';
      case 'container': return 'rgb(34, 211, 238)';
      case 'user': return 'rgb(109, 40, 217)';
      case 'other': return 'rgb(107, 114, 128)';
      default: return 'rgb(107, 114, 128)';
    }
  };
  
  const getCategoryIcon = (category: ProcessNode['category']) => {
    switch (category) {
      case 'system': return <Server className="w-5 h-5" />;
      case 'python': return <Clock className="w-5 h-5" />;
      case 'llm': return <Activity className="w-5 h-5" />;
      case 'agent': return <Shield className="w-5 h-5" />;
      case 'web': return <BarChart3 className="w-5 h-5" />;
      case 'database': return <Database className="w-5 h-5" />;
      case 'container': return <Package className="w-5 h-5" />;
      case 'user': return <User className="w-5 h-5" />;
      case 'other': return <HelpCircle className="w-5 h-5" />;
      default: return <HelpCircle className="w-5 h-5" />;
    }
  };
  
  // 检查进程类型是否被过滤
  const isProcessTypeFiltered = (category: ProcessNode['category']) => {
    const processType = getCategoryName(category);
    return Object.keys(filteredProcessTypes).length === 0 || !!filteredProcessTypes[processType];
  };
  
  // 检查日志类型是否被过滤
  const isLogTypeFiltered = (entry: ParsedLogEntry) => {
    return Object.keys(filteredLogTypes).length === 0 || !!filteredLogTypes[entry.dataType];
  };
  
  // 进程分类判断函数
  const categorizeProcess = (pName: string): 'system' | 'python' | 'llm' | 'agent' | 'web' | 'database' | 'container' | 'user' | 'other' => {
    const lowerPName = pName.toLowerCase();
    
    // 运行脚本
    const pyServices = ['python', 'python3', 'pip', 'py', 'sh'];
    if (pyServices.some(service => lowerPName.includes(service))) {
      return 'python';
    }

    // LLM服务（大语言模型相关）
    const llmServices = ['vllm', 'ollama', 'llama', 'gpt', 'openai', 'anthropic', 'claude', 'mistral', 'gemma', 'gemini', 'bard', 'copilot', 'huggingface', 'transformers', 'tensorflow', 'pytorch', 'torch', 'onnx', 'triton'];
    if (llmServices.some(service => lowerPName.includes(service))) {
      return 'llm';
    }
    
    // Agent服务（智能体相关）
    const agentServices = ['dify', 'agent', 'crewai', 'autogen', 'langchain', 'haystack', 'llamaindex'];
    if (agentServices.some(service => lowerPName.includes(service))) {
      return 'agent';
    }
    
    // 数据库服务（数据库相关）
    const databaseServices = ['mysql', 'postgresql', 'postgres', 'redis', 'mongodb', 'mariadb', 'sqlite', 'elasticsearch', 'opensearch', 'minio', 'ceph'];
    if (databaseServices.some(service => lowerPName.includes(service))) {
      return 'database';
    }
    
    // 容器服务（容器和编排服务）
    const containerServices = ['docker', 'kubelet', 'containerd', 'cri-o', 'k8s', 'kubernetes', 'helm', 'kubectl', 'podman', 'runc'];
    if (containerServices.some(service => lowerPName.includes(service))) {
      return 'container';
    }
    
    // Web服务（Web服务器和框架）
    const webServices = ['nginx', 'apache', 'fastapi', 'uvicorn', 'gunicorn', 'flask', 'django', 'node', 'express', 'next', 'react', 'vue', 'libuv', 'squid'];
    if (webServices.some(service => lowerPName.includes(service))) {
      return 'web';
    }
    
    // 系统服务（基础系统服务和工具）
    const systemServices = ['systemd', 'sshd', 'cron', 'rsyslog', 'udev', 'networkd', 'journald', 'polkitd', 'bluetoothd', 'avahi-daemon', 'vmhgfs-fuse', 'lsof', 'ls', 'ps', 'top', 'htop', 'df', 'du', 'cat', 'echo', 'grep', 'awk', 'sed'];
    if (systemServices.some(service => lowerPName.includes(service))) {
      return 'system';
    }
    
    // 用户进程（更宽松的判断条件）
    if (pName && pName.length > 0) {
      // 排除空进程名
      if (pName.includes('/') || pName.includes('-') || /^[A-Z]/.test(pName) || pName.includes('.') || 
          pName.endsWith('.sh') || pName.includes('git')) {
        return 'user';
      }
    }
    
    return 'other';
  };

  // 按PID聚合日志条目
  const processNodes = useMemo(() => {
    const pidMap = new Map<string, ProcessNode>();
    
    logs.forEach(entry => {
      if (!entry.pid) return;
      
      if (!pidMap.has(entry.pid)) {
        const startTime = entry.sessionCreatedAt || entry.collectTime ? new Date(entry.sessionCreatedAt || entry.collectTime) : new Date();
        pidMap.set(entry.pid, {
          pid: entry.pid,
          entries: [],
          pName: entry.pName || '',
          startTime,
          endTime: startTime,
          entryTypes: [],
          totalEntries: 0,
          category: 'other' // 默认分类，后续会更新
        });
      }
      
      const node = pidMap.get(entry.pid)!;
      node.entries.push(entry);
      
      // 更新结束时间
      const entryTime = entry.sessionEndedAt || entry.collectTime ? new Date(entry.sessionEndedAt || entry.collectTime) : new Date();
      if (entryTime > node.endTime) {
        node.endTime = entryTime;
      }
      
      // 更新条目类型
      if (!node.entryTypes.includes(entry.dataType)) {
        node.entryTypes.push(entry.dataType);
      }
      
      node.totalEntries++;
    });
    
    // 转换为数组，更新分类，并按时间排序
    return Array.from(pidMap.values())
      .map(node => ({
        ...node,
        category: categorizeProcess(node.pName)
      }))
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }, [logs]);
  
  // 过滤搜索结果
  const filteredProcesses = useMemo(() => {
    const searchLower = searchKeyword.toLowerCase();
    
    return processNodes.filter(node => {
      // 进程类型过滤
      if (!isProcessTypeFiltered(node.category)) return false;
      
      // 日志类型过滤 - 至少有一个条目符合日志类型过滤条件
      const hasValidEntries = node.entries.some(entry => isLogTypeFiltered(entry));
      if (!hasValidEntries) return false;
      
      // 搜索过滤
      if (!searchKeyword.trim()) return true;
      
      // 搜索PID
      if (node.pid.toLowerCase().includes(searchLower)) return true;
      
      // 搜索进程名
      if (node.pName.toLowerCase().includes(searchLower)) return true;
      
      // 搜索分类名称
      if (getCategoryName(node.category).toLowerCase().includes(searchLower)) return true;
      
      // 搜索条目的数据类型
      if (node.entryTypes.some(type => type.toLowerCase().includes(searchLower))) return true;
      
      // 搜索条目的其他字段
      return node.entries.some(entry => {
        return (
          (entry.dataType && entry.dataType.toLowerCase().includes(searchLower)) ||
          (entry.logID && entry.logID.toLowerCase().includes(searchLower)) ||
          (entry.ModelName && entry.ModelName.toLowerCase().includes(searchLower)) ||
          (entry.mcpMethod && entry.mcpMethod.toLowerCase().includes(searchLower)) ||
          (entry.pName && entry.pName.toLowerCase().includes(searchLower))
        );
      });
    });
  }, [processNodes, searchKeyword, filteredProcessTypes, filteredLogTypes]);
  
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
  
  // 格式化时间，添加毫秒
  const formatTime = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      fractionalSecondDigits: 3
    });
  };
  

  
  // 处理PID节点展开/折叠
  const togglePid = (pid: string) => {
    setExpandedPids(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pid)) {
        newSet.delete(pid);
      } else {
        newSet.add(pid);
      }
      return newSet;
    });
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
  
  // 渲染单个日志条目
  const renderLogEntry = (entry: ParsedLogEntry, index: number) => {
    const isExpanded = expandedEntries.has(entry.logID || '');
    
    // 优化卡片标题显示，优先显示关键信息
    const displayTitle = (() => {
      // 根据类型显示不同的关键信息
      switch (entry.dataType) {
        case 'HTTP':
          // 从HTTP请求中提取路径信息
          if (entry.parsedReqPayload) {
            const match = entry.parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
            if (match) {
              return `${match[1]} ${match[2]}`;
            }
          }
          break;
        case 'LLM':
        case 'AGENT':
          // 显示模型名称
          if (entry.ModelName) {
            return `${entry.ModelName} Request`;
          } else {
            if (entry.parsedReqPayload) {
              const match = entry.parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
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
          if (entry.parsedReqPayload) {
            const methodMatch = entry.parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
            if (methodMatch) {
              httpMethod = methodMatch[1];
              httpURL = methodMatch[2];
            }
          }
          
          // 优先显示带有query的标题，结合HTTP方法
          if (entry.parsedQuery) {
            const shortQuery = entry.parsedQuery.length > 50 ? entry.parsedQuery.substring(0, 50) + '...' : entry.parsedQuery;
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
            if (entry.parsedReqPayload) {
              const match = entry.parsedReqPayload.match(/^(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
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
          return 'File Operation';
        case 'EXEC':
          if (entry.parsedQuery || entry.query) {
            const cmd = entry.parsedQuery || entry.query || '';
            return cmd.length > 100 ? cmd.substring(0, 100) + '...' : cmd;
          }
          return 'Command Execution';
      }
      
      // 其他类型优先显示用户查询
      if (entry.parsedQuery) {
        return entry.parsedQuery.length > 100 ? entry.parsedQuery.substring(0, 100) + '...' : entry.parsedQuery;
      }
      
      // 默认显示
      return `${entry.dataType} Request`;
    })();
    
    return (
      <div key={entry.logID || index} className="flex items-center gap-3">
        {/* 左侧时间线区域 - 缩小宽度 */}
        <div className="relative flex flex-col items-center w-16">
          {/* 时间线节点 - 缩小尺寸 */}
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shadow-sm transition-all duration-200 ${isExpanded ? 'scale-110' : ''}`} style={{ backgroundColor: getDataTypeColor(entry.dataType) }}>
            {getDataTypeIcon(entry.dataType)}
          </div>
          
          {/* 时间线连接线 */}
          <div className="w-0.5 h-full bg-gradient-to-b from-[var(--border-color)]/80 via-[var(--border-color)]/50 to-[var(--border-color)]/20 absolute top-5 left-1/2 transform -translate-x-1/2" style={{ height: 'calc(100% + 12px)' }} />
          
          {/* 时间标注 - 缩小字体 */}
          <div className="mt-0.5 text-[9px] font-medium text-[var(--text-secondary)] whitespace-nowrap">
            {formatTime(entry.sessionCreatedAt || entry.collectTime || '')}
          </div>
        </div>
        
        {/* 右侧卡片区域 - 减少内边距和外边距 */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.02, ease: "easeOut" }}
          className="flex-1 rounded-xl bg-[var(--card-background)] border border-[var(--border-color)] overflow-hidden hover:shadow-sm transition-all duration-300"
        >
          <div
            className="p-2.5 cursor-pointer"
            onClick={() => toggleEntry(entry.logID || '')}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {/* 合并第一行和第二行：标题、类型、话单ID - Apple官网风格 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="font-semibold px-1.5 py-0.5 rounded-full text-[11px] whitespace-nowrap" style={{ backgroundColor: `${getDataTypeColor(entry.dataType)}33`, color: getDataTypeColor(entry.dataType) }}>
                        {highlightKeyword(entry.dataType, searchKeyword)}
                      </span>
                      <h4 className="text-xs font-semibold text-[var(--foreground)] truncate flex-1 leading-tight">
                        {highlightKeyword(displayTitle, searchKeyword)}
                      </h4>
                      <CopyableLogId id={entry.logID || entry.id} className="ml-1" textClassName="text-[11px] text-[var(--text-secondary)]" />
                    </div>
                
                {/* 增强的缩略内容 - 参考实时日志展示 */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-secondary)] leading-tight">
                  {entry.dataType === 'FILE' ? (
                    <>
                      {entry.pid && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">PID:</span>
                          <span>{highlightKeyword(entry.pid, searchKeyword)}</span>
                        </div>
                      )}
                      {entry.pName && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">进程名:</span>
                          <span>{highlightKeyword(entry.pName, searchKeyword)}</span>
                        </div>
                      )}
                      {entry.llmProvider && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">风险:</span>
                          <span className={`px-1 py-0.5 rounded-full text-[10px] ${getRiskLevelBgClass(entry.llmProvider)}`}>
                            {highlightKeyword(entry.llmProvider, searchKeyword)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : entry.dataType === 'EXEC' ? (
                    <>
                      {entry.pid && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">PID:</span>
                          <span>{highlightKeyword(entry.pid, searchKeyword)}</span>
                        </div>
                      )}
                      {entry.pName && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">进程名:</span>
                          <span>{highlightKeyword(entry.pName, searchKeyword)}</span>
                        </div>
                      )}
                      {entry.llmProvider && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">风险:</span>
                          <span className={`px-1 py-0.5 rounded-full text-[10px] ${getRiskLevelBgClass(entry.llmProvider)}`}>
                            {highlightKeyword(entry.llmProvider, searchKeyword)}
                          </span>
                        </div>
                      )}
                      {entry.tokenTotal && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">参数:</span>
                          <span>{highlightKeyword(entry.tokenTotal, searchKeyword)}</span>
                        </div>
                      )}
                      {entry.answer && (
                        <div className="flex items-center gap-1 max-w-xs" title={decodeBase64(entry.answer)}>
                          <span className="font-medium">路径:</span>
                          <span className="truncate font-mono text-[10px]">{highlightKeyword(decodeBase64(entry.answer), searchKeyword)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 进程ID */}
                      {entry.pid && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">PID:</span>
                          <span>{highlightKeyword(entry.pid, searchKeyword)}</span>
                        </div>
                      )}
                      
                      {/* 进程名 */}
                      {entry.pName && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">进程名:</span>
                          <span>{highlightKeyword(entry.pName, searchKeyword)}</span>
                        </div>
                      )}
                      
                      {/* 请求IP和端口 */}
                      {entry.reqIp && entry.reqPort && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">请求:</span>
                          <span>{highlightKeyword(`${entry.reqIp}:${entry.reqPort}`, searchKeyword)}</span>
                        </div>
                      )}
                      
                      {/* 响应IP和端口 */}
                      {entry.respIp && entry.respPort && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">响应:</span>
                          <span>{highlightKeyword(`${entry.respIp}:${entry.respPort}`, searchKeyword)}</span>
                        </div>
                      )}
                      
                      {/* Token信息 */}
                      {entry.tokenTotal && parseInt(entry.tokenTotal) > 0 && (
                        <div className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          <span>{highlightKeyword(entry.tokenTotal, searchKeyword)} tokens</span>
                        </div>
                      )}
                      
                      {/* 模型名称 */}
                      {entry.ModelName && (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-medium px-1 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                            {highlightKeyword(entry.ModelName, searchKeyword)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              {/* 展开/收起按钮 - 缩小尺寸 */}
              <button className="p-1 hover:bg-[var(--border-color)]/20 rounded-lg transition-all duration-200 flex-shrink-0">
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[var(--accent-blue)] transition-transform duration-200" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[var(--text-secondary)] transition-transform duration-200" />
                )}
              </button>
            </div>
          </div>
          
          {/* 展开的详细信息 - 展示所有实时日志字段 */}
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="border-t border-[var(--border-color)]/50 p-3.5 bg-[var(--background)]/50"
            >
              {/* 详情内容 - 统一对齐和字体 */}
              <div className="space-y-4">
                {entry.dataType === 'FILE' ? (
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
                      <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">文件操作详情</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">文件敏感风险等级</label>
                          <span className={`px-2 py-1 rounded-full text-xs ${getRiskLevelBgClass(entry.llmProvider || '')}`}>
                            {entry.llmProvider || 'N/A'}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程ID</label>
                          <div className="text-[var(--foreground)]">{entry.pid || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程名</label>
                          <div className="text-[var(--foreground)]">{entry.pName || 'N/A'}</div>
                        </div>
                        <div className="col-span-1 md:col-span-4 space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">文件路径</label>
                          <div className="text-[var(--foreground)] font-mono break-all">{decodeBase64(entry.answer) || 'N/A'}</div>
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
                          <span className={`px-2 py-1 rounded-full text-xs ${getRiskLevelBgClass(entry.llmProvider || '')}`}>
                            {entry.llmProvider || 'N/A'}
                          </span>
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
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程ID</label>
                          <div className="text-[var(--foreground)]">{entry.pid || 'N/A'}</div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">进程名</label>
                          <div className="text-[var(--foreground)]">{entry.pName || 'N/A'}</div>
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
                    {(entry.agentID || entry.agentName || entry.workflowStatus) && (
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
                    {(entry.ModelName || entry.llmProvider || entry.llmID) && (
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
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM版本</label>
                            <div className="text-[var(--foreground)]">{entry.llmVersion || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">LLM ID</label>
                            <div className="text-[var(--foreground)] font-mono text-xs">{entry.llmID || 'N/A'}</div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">流式模式</label>
                            <div className="text-[var(--foreground)]">{entry.llmStream === '1' ? '是' : '否'}</div>
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
                    {(entry.parsedQuery || entry.parsedAnswer) && (
                      <div className="bg-[var(--card-background)] rounded-xl p-3 border border-[var(--border-color)]/50 shadow-sm">
                        <h5 className="text-xs font-semibold text-[var(--accent-blue)] mb-2.5 uppercase tracking-wider">对话内容</h5>
                        {entry.parsedQuery && (
                          <div className="mb-3.5 space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">查询</label>
                            <div className="text-xs bg-[var(--background)] p-2.5 rounded-lg">
                              {entry.parsedQuery}
                            </div>
                          </div>
                        )}
                        {entry.parsedAnswer && (
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">回答</label>
                            <div className="text-xs bg-[var(--background)] p-2.5 rounded-lg">
                              {entry.parsedAnswer}
                            </div>
                          </div>
                        )}
                        {entry.thought && (
                          <div className="mt-3.5 space-y-1">
                            <label className="text-xs font-medium text-[var(--text-secondary)] block">思考过程</label>
                            <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto max-h-40">
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
                          <label className="text-xs font-medium text-[var(--text-secondary)] block">Response Payload</label>
                          <pre className="text-[var(--foreground)] font-mono text-xs bg-[var(--background)] p-2.5 rounded-lg overflow-x-auto max-h-70">
                            {entry.parsedRspPayload}
                          </pre>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  };
  
  // 渲染进程节点
  const renderProcessNode = (node: ProcessNode, index: number) => {
    const isExpanded = expandedPids.has(node.pid);
    const categoryColor = getCategoryColor(node.category);
    
    return (
      <div key={node.pid} className="mb-5">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: index * 0.05, ease: "easeOut" }}
          className="rounded-2xl bg-[var(--card-background)] border border-[var(--border-color)] overflow-hidden hover:shadow-lg transition-all duration-300"
          whileHover={{ y: -2 }}
        >
          {/* 进程标题行 */}
          <div
            className="p-4 cursor-pointer flex items-center justify-between"
            onClick={() => togglePid(node.pid)}
          >
            <div className="flex items-center gap-3">
              {/* 分类图标 */}
              <motion.div
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-sm"
                style={{ backgroundColor: `${categoryColor}20` }}
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <div style={{ color: categoryColor }}>
                  {getCategoryIcon(node.category)}
                </div>
              </motion.div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 进程名称和PID */}
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    {highlightKeyword(node.pName, searchKeyword)}
                  </h3>
                  <span className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--background)] px-2 py-0.5 rounded-full">
                    pid: {highlightKeyword(node.pid, searchKeyword)}
                  </span>
                  
                  {/* 分类标签 */}
                  <span 
                    className="text-xs font-medium px-2.5 py-0.5 rounded-full shadow-sm"
                    style={{ 
                      backgroundColor: `${categoryColor}20`, 
                      color: categoryColor,
                      border: `1px solid ${categoryColor}30`
                    }}
                  >
                    {getCategoryName(node.category)}
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {/* 时间范围 */}
                  <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(node.startTime)} - {formatTime(node.endTime)}</span>
                  </div>
                  
                  {/* 条目数量 */}
                  <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    <Activity className="w-3.5 h-3.5" />
                    <span>{node.totalEntries} 个条目</span>
                  </div>
                  
                  {/* 条目类型 */}
                  <div className="flex gap-1.5 ml-2">
                    {node.entryTypes.map(type => (
                      <span 
                        key={type} 
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full shadow-sm"
                        style={{ 
                          backgroundColor: `${getDataTypeColor(type)}20`, 
                          color: getDataTypeColor(type),
                          border: `1px solid ${getDataTypeColor(type)}30`
                        }}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {/* 展开/收起按钮 */}
            <motion.button 
              className="p-2 rounded-full hover:bg-[var(--border-color)]/20 transition-all duration-200"
              whileTap={{ scale: 0.95 }}
            >
              {isExpanded ? (
                <ChevronUp 
                  className="w-5 h-5 transition-transform duration-200"
                  style={{ color: categoryColor }}
                />
              ) : (
                <ChevronDown 
                  className="w-5 h-5 transition-transform duration-200"
                  style={{ color: categoryColor }}
                />
              )}
            </motion.button>
          </div>
          
          {/* 进程下的日志条目 */}
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="border-t border-[var(--border-color)]/30 p-4 bg-gradient-to-b from-[var(--card-background)] to-[var(--background)]/30"
            >
              <div className="space-y-4">
                {node.entries.map((entry, index) => renderLogEntry(entry, index))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  };
  
  // 按分类分组进程
  const groupedProcesses = useMemo(() => {
    const groups = {
      system: filteredProcesses.filter(node => node.category === 'system'),
      python: filteredProcesses.filter(node => node.category === 'python'),
      llm: filteredProcesses.filter(node => node.category === 'llm'),
      agent: filteredProcesses.filter(node => node.category === 'agent'),
      web: filteredProcesses.filter(node => node.category === 'web'),
      database: filteredProcesses.filter(node => node.category === 'database'),
      container: filteredProcesses.filter(node => node.category === 'container'),
      user: filteredProcesses.filter(node => node.category === 'user'),
      other: filteredProcesses.filter(node => node.category === 'other')
    };
    return groups;
  }, [filteredProcesses]);

  // 分类顺序
  const categoryOrder: Array<'system' | 'python' | 'llm' | 'agent' | 'web' | 'database' | 'container' | 'user' | 'other'> = ['system', 'python', 'llm', 'agent', 'web', 'database', 'container', 'user', 'other'];

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
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg"
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ duration: 0.2 }}
              style={{
                boxShadow: '0 8px 16px -4px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2) inset'
              }}
            >
              <Cpu className="w-5 h-5 text-white" />
            </motion.div>
            <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">进程分类分析</h3>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <span>按进程类型分类展示</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full">
                共 {filteredProcesses.length} 个进程
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* 进程列表 */}
      <div>
        {filteredProcesses.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 text-[var(--text-secondary)]">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                {searchKeyword ? '没有找到匹配的进程' : '暂无进程数据'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 按分类展示进程 */}
            {categoryOrder.map((category) => {
              const processes = groupedProcesses[category];
              if (processes.length === 0) return null;
              
              const categoryColor = getCategoryColor(category);
              
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="space-y-4"
                >
                  {/* 分类标题 */}
                  <motion.div 
                    className="flex items-center gap-3"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    <div 
                      className="w-3 h-12 rounded-full"
                      style={{ backgroundColor: categoryColor }}
                    />
                    <div className="flex items-center justify-between w-full">
                      <h3 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <span style={{ color: categoryColor }}>{getCategoryIcon(category)}</span>
                        <span>{getCategoryName(category)}</span>
                        <span className="text-xs font-medium text-[var(--text-secondary)]">
                          ({processes.length} 个进程)
                        </span>
                      </h3>
                    </div>
                  </motion.div>
                  
                  {/* 分类下的进程列表 */}
                  <div className="ml-6 space-y-4">
                    {processes.map((node, index) => renderProcessNode(node, index))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
