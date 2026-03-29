'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParsedLogEntry } from '@/types/log';
import { AggregatedSession } from '@/lib/sessionAggregator';
import { buildTopologyData, getNodeTypeColor, getConnectionTypeColor, getConnectionLineWidth } from '@/lib/topologyBuilder';
import { TopologyNode, TopologyConnection, ViewportTransform } from '@/types/topology';
import { Server, FileText, Globe, Zap, ExternalLink, Clock, Network, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface TopologyGraphProps {
  session: AggregatedSession;
  onEntryClick?: (entry: ParsedLogEntry) => void;
}

interface HoveredNode {
  node: TopologyNode;
  x: number;
  y: number;
}

interface HoveredConnection {
  connection: TopologyConnection;
  x: number;
  y: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const NODE_RADIUS = 12;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

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

export function TopologyGraph({ session, onEntryClick }: TopologyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const isDark = useTheme();
  
  const [transform, setTransform] = useState<ViewportTransform>({
    scale: 1,
    translateX: 0,
    translateY: 0
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<HoveredConnection | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOverviewVisible, setIsOverviewVisible] = useState(false);

  const topologyData = useMemo(() => {
    return buildTopologyData(session);
  }, [session]);

  const canvasSize = useMemo(() => {
    if (topologyData.nodes.length === 0) {
      return { width: 1200, height: 800 };
    }
    
    const padding = 300;
    const minX = Math.min(...topologyData.nodes.map(n => n.x));
    const maxX = Math.max(...topologyData.nodes.map(n => n.x));
    const minY = Math.min(...topologyData.nodes.map(n => n.y));
    const maxY = Math.max(...topologyData.nodes.map(n => n.y));
    
    return {
      width: Math.max(1200, maxX - minX + padding * 2),
      height: Math.max(800, maxY - minY + padding * 2)
    };
  }, [topologyData]);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleResetView = useCallback(() => {
    if (topologyData.nodes.length === 0) {
      setTransform({ scale: 1, translateX: 0, translateY: 0 });
      return;
    }
    
    const containerWidth = containerRef.current?.clientWidth || 1200;
    const containerHeight = containerRef.current?.clientHeight || 800;
    
    const minX = Math.min(...topologyData.nodes.map(n => n.x));
    const maxX = Math.max(...topologyData.nodes.map(n => n.x));
    const minY = Math.min(...topologyData.nodes.map(n => n.y));
    const maxY = Math.max(...topologyData.nodes.map(n => n.y));
    
    const contentWidth = maxX - minX + NODE_WIDTH * 2;
    const contentHeight = maxY - minY + NODE_HEIGHT * 2;
    
    const scaleX = containerWidth / contentWidth * 0.8;
    const scaleY = containerHeight / contentHeight * 0.8;
    const newScale = Math.min(scaleX, scaleY, 1.2);
    
    const contentCenterX = (minX + maxX) / 2 + NODE_WIDTH / 2;
    const contentCenterY = (minY + maxY) / 2 + NODE_HEIGHT / 2;
    
    const newTranslateX = containerWidth / 2 - contentCenterX * newScale;
    const newTranslateY = containerHeight / 2 - contentCenterY * newScale;
    
    setTransform({ scale: newScale, translateX: newTranslateX, translateY: newTranslateY });
  }, [topologyData]);

  useEffect(() => {
    if (isLoaded && topologyData.nodes.length > 0) {
      handleResetView();
    }
  }, [isLoaded, topologyData, handleResetView]);

  // 响应式处理
  useEffect(() => {
    const handleResize = () => {
      if (topologyData.nodes.length > 0) {
        handleResetView();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [topologyData, handleResetView]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.translateX, y: e.clientY - transform.translateY });
    }
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const newTranslateX = e.clientX - dragStart.x;
      const newTranslateY = e.clientY - dragStart.y;
      setTransform(prev => ({ ...prev, translateX: newTranslateX, translateY: newTranslateY }));
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(Math.max(MIN_ZOOM, transform.scale * delta), MAX_ZOOM);
    
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const scaleChange = newScale / transform.scale;
      const newTranslateX = mouseX - (mouseX - transform.translateX) * scaleChange;
      const newTranslateY = mouseY - (mouseY - transform.translateY) * scaleChange;
      
      setTransform({ scale: newScale, translateX: newTranslateX, translateY: newTranslateY });
    }
  }, [transform]);

  const handleNodeHover = useCallback((node: TopologyNode, e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setHoveredNode({
        node,
        x: e.clientX,
        y: e.clientY
      });
    }
  }, []);

  const handleConnectionHover = useCallback((connection: TopologyConnection, e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setHoveredConnection({
        connection,
        x: e.clientX,
        y: e.clientY
      });
    }
  }, []);

  const handleNodeClick = useCallback((node: TopologyNode) => {
    if (node.entries.length > 0 && onEntryClick) {
      onEntryClick(node.entries[0]);
    }
  }, [onEntryClick]);

  const handleConnectionClick = useCallback((connection: TopologyConnection) => {
    if (onEntryClick) {
      onEntryClick(connection.entry);
    }
  }, [onEntryClick]);

  const getConnectionPoints = (sourceNode: TopologyNode, targetNode: TopologyNode) => {
    const sourceCenterX = sourceNode.x + NODE_WIDTH / 2;
    const sourceCenterY = sourceNode.y + NODE_HEIGHT / 2;
    const targetCenterX = targetNode.x + NODE_WIDTH / 2;
    const targetCenterY = targetNode.y + NODE_HEIGHT / 2;

    const deltaX = targetCenterX - sourceCenterX;
    const deltaY = targetCenterY - sourceCenterY;

    let sourceX, sourceY, targetX, targetY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        sourceX = sourceNode.x + NODE_WIDTH;
        sourceY = sourceCenterY;
        targetX = targetNode.x;
        targetY = targetCenterY;
      } else {
        sourceX = sourceNode.x;
        sourceY = sourceCenterY;
        targetX = targetNode.x + NODE_WIDTH;
        targetY = targetCenterY;
      }
    } else {
      if (deltaY > 0) {
        sourceX = sourceCenterX;
        sourceY = sourceNode.y + NODE_HEIGHT;
        targetX = targetCenterX;
        targetY = targetNode.y;
      } else {
        sourceX = sourceCenterX;
        sourceY = sourceNode.y;
        targetX = targetCenterX;
        targetY = targetNode.y + NODE_HEIGHT;
      }
    }

    return { sourceX, sourceY, targetX, targetY };
  };

  const renderBezierCurve = (sourceX: number, sourceY: number, targetX: number, targetY: number, color: string, isHovered: boolean, lineWidth: number) => {
    let path: string;
    
    const deltaX = Math.abs(targetX - sourceX);
    const deltaY = Math.abs(targetY - sourceY);
    
    if (deltaX > deltaY) {
      const midY = (sourceY + targetY) / 2;
      const controlX = Math.min(sourceX, targetX) + deltaX / 2;
      path = `M ${sourceX} ${sourceY} C ${controlX} ${sourceY}, ${controlX} ${targetY}, ${targetX} ${targetY}`;
    } else {
      const midX = (sourceX + targetX) / 2;
      const controlY = Math.min(sourceY, targetY) - 30;
      path = `M ${sourceX} ${sourceY} C ${midX} ${controlY}, ${midX} ${controlY}, ${targetX} ${targetY}`;
    }
    
    return (
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={isHovered ? lineWidth + 2 : lineWidth}
        strokeLinecap="round"
        style={{
          filter: `drop-shadow(0 2px 4px ${color}40)`,
          transition: 'all 0.2s ease-in-out'
        }}
      />
    );
  };

  const renderConnectionLabel = (connection: TopologyConnection, sourceX: number, sourceY: number, targetX: number, targetY: number) => {
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2 - 15;
    const color = getConnectionTypeColor(connection.type);
    const isHovered = hoveredConnection?.connection.id === connection.id;

    return (
      <g
        onMouseEnter={(e) => handleConnectionHover(connection, e)}
        onMouseLeave={() => setHoveredConnection(null)}
        onClick={() => handleConnectionClick(connection)}
        style={{ cursor: 'pointer' }}
      >
        <motion.rect
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          x={midX - 60}
          y={midY - 14}
          width={120}
          height={28}
          rx={14}
          fill={color}
          style={{
            filter: `drop-shadow(0 4px 8px ${color}40)`,
            opacity: isHovered ? 1 : 0.9
          }}
        />
        <text
          x={midX}
          y={midY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[11px] fill-white font-semibold"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
        >
          {connection.label}
        </text>
      </g>
    );
  };

  const renderNode = (node: TopologyNode) => {
    const typeColor = getNodeTypeColor(node.type);
    const isHovered = hoveredNode?.node.id === node.id;
    const x = node.x;
    const y = node.y;
    const nodeBackgroundColor = isDark ? '#0a0a0a' : '#f8f8f8';
    const nodeTextColor = isDark ? 'white' : 'var(--foreground)';
    const nodeSubtextColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';

    const getNodeIcon = () => {
      switch (node.type) {
        case 'server':
          return <Server className="w-6 h-6" style={{ color: typeColor }} />;
        case 'mcp':
          return <Zap className="w-6 h-6" style={{ color: typeColor }} />;
        case 'http':
          return <Globe className="w-6 h-6" style={{ color: typeColor }} />;
        case 'file':
          return <FileText className="w-6 h-6" style={{ color: typeColor }} />;
        default:
          return <Server className="w-6 h-6" style={{ color: typeColor }} />;
      }
    };

    return (
      <g
        key={node.id}
        onMouseEnter={(e) => handleNodeHover(node, e)}
        onMouseLeave={() => setHoveredNode(null)}
        onClick={() => handleNodeClick(node)}
        style={{ cursor: 'pointer' }}
      >
        <motion.g
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, delay: isLoaded ? 0.1 : 0 }}
          whileHover={{ scale: 1.03, y: -3 }}
          whileTap={{ scale: 0.98 }}
        >
          <defs>
            <linearGradient id={`nodeGradient-${node.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={nodeBackgroundColor} />
              <stop offset="100%" stopColor={isDark ? '#1a1a1a' : '#ffffff'} />
            </linearGradient>
            <filter id={`nodeShadow-${node.id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor={typeColor} floodOpacity={isDark ? 0.3 : 0.15} />
            </filter>
          </defs>

          <rect
            x={x}
            y={y}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
            rx={NODE_RADIUS}
            fill={`url(#nodeGradient-${node.id})`}
            style={{
              filter: `url(#nodeShadow-${node.id})`,
              transition: 'all 0.3s ease',
              border: `1px solid ${typeColor}30`,
              boxShadow: isHovered ? `0 0 30px ${typeColor}60` : 'none'
            }}
          />

          <rect
            x={x + 1}
            y={y + 1}
            width={NODE_WIDTH - 2}
            height={NODE_HEIGHT - 2}
            rx={NODE_RADIUS - 1}
            fill="none"
            stroke={typeColor}
            strokeWidth={isHovered ? "2" : "1"}
            style={{ 
              transition: 'all 0.3s ease',
              filter: isHovered ? `brightness(1.1)` : 'none'
            }}
          />

          <foreignObject x={x} y={y} width={NODE_WIDTH} height={NODE_HEIGHT}>
            <div className="w-full h-full flex flex-col items-center justify-center p-3">
              <div className="mb-2.5">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  {getNodeIcon()}
                </motion.div>
              </div>
              <div className="text-[12px] font-semibold text-center leading-tight" style={{ color: nodeTextColor }}>
                {node.label}
              </div>
              {node.port && node.port !== '0' && (
                <div className="text-[10px] mt-1.5" style={{ color: nodeSubtextColor }}>
                  :{node.port}
                </div>
              )}
            </div>
          </foreignObject>

          {node.entries.length > 1 && (
            <>
              <motion.circle
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                whileHover={{ scale: 1.1 }}
                cx={x + NODE_WIDTH - 12}
                cy={y + 12}
                r={10}
                fill={typeColor}
                style={{ 
                  filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.3))',
                  transition: 'all 0.3s ease'
                }}
              />
              <motion.text
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                x={x + NODE_WIDTH - 12}
                y={y + 14}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] fill-white font-bold"
              >
                {node.entries.length}
              </motion.text>
            </>
          )}
        </motion.g>
      </g>
    );
  };

  const renderConnections = () => {
    return topologyData.connections.map((connection, index) => {
      const sourceNode = topologyData.nodes.find(n => n.id === connection.sourceId);
      const targetNode = topologyData.nodes.find(n => n.id === connection.targetId);
      
      if (!sourceNode || !targetNode) return null;

      const { sourceX, sourceY, targetX, targetY } = getConnectionPoints(sourceNode, targetNode);
      const color = getConnectionTypeColor(connection.type);
      const isHovered = hoveredConnection?.connection.id === connection.id;
      const lineWidth = getConnectionLineWidth(connection);

      return (
        <g key={connection.id}>
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 + index * 0.02 }}
            onMouseEnter={(e) => handleConnectionHover(connection, e)}
            onMouseLeave={() => setHoveredConnection(null)}
            onClick={() => handleConnectionClick(connection)}
            style={{ cursor: 'pointer' }}
          >
            {renderBezierCurve(sourceX, sourceY, targetX, targetY, color, isHovered, lineWidth)}
            {renderConnectionLabel(connection, sourceX, sourceY, targetX, targetY)}
          </motion.g>
        </g>
      );
    });
  };

  const renderTooltip = () => {
    if (hoveredNode) {
      const { node, x, y } = hoveredNode;
      
      // 解码 BASE64 文件路径 - 支持UTF-8编码
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
      
      return (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 bg-[var(--background)]/95 backdrop-blur-xl rounded-xl border border-[var(--border-color)] shadow-2xl p-4 min-w-[280px] max-w-[350px]"
            style={{
              left: Math.min(x, window.innerWidth - 370),
              top: Math.min(y + 10, window.innerHeight - 250)
            }}
            onMouseEnter={() => setHoveredNode(hoveredNode)}
            onMouseLeave={() => setHoveredNode(null)}
          >
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-color)]/50">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor(node.type) }} />
              <h5 className="text-sm font-semibold text-[var(--foreground)]">
                {node.type.toUpperCase()} 节点
              </h5>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                <div className="text-[var(--text-secondary)] mb-1">标签</div>
                <div className="text-sm font-medium text-[var(--foreground)]">{node.label}</div>
              </div>
              
              {/* FILE 节点特殊处理 */}
              {node.type === 'file' && node.entries.length > 0 && (
                <>
                  <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                    <div className="text-[var(--text-secondary)] mb-1">文件路径</div>
                    <div className="text-sm font-medium text-[var(--foreground)] break-all">
                      {decodeBase64(node.entries[0].answer)}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1">进程名</div>
                      <div className="text-sm font-medium text-[var(--foreground)]">
                        {node.entries[0].pName || '未知'}
                      </div>
                    </div>
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1">进程ID</div>
                      <div className="text-sm font-medium text-[var(--foreground)]">
                        {node.entries[0].pid || '未知'}
                      </div>
                    </div>
                  </div>
                </>
              )}
              
              {/* 非 FILE 节点显示 IP 和端口 */}
              {node.type !== 'file' && (
                <div className="grid grid-cols-2 gap-2">
                  {node.ip && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1">IP地址</div>
                      <div className="text-sm font-medium text-[var(--foreground)]">{node.ip}</div>
                    </div>
                  )}
                  {node.port && node.port !== '0' && (
                    <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                      <div className="text-[var(--text-secondary)] mb-1">端口</div>
                      <div className="text-sm font-medium text-[var(--foreground)]">:{node.port}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                <div className="text-[var(--text-secondary)] mb-1">关联话单数</div>
                <div className="text-sm font-medium text-[var(--foreground)]">{node.entries.length}</div>
              </div>
            </div>

            {onEntryClick && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                <button
                  className="w-full flex items-center justify-center gap-2 text-xs font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] focus:outline-none transition-colors py-2 px-3 rounded-lg hover:bg-[var(--accent-blue)]/10"
                  onClick={() => handleNodeClick(node)}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  查看详情
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      );
    }

    if (hoveredConnection) {
      const { connection, x, y } = hoveredConnection;
      return (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 bg-[var(--background)]/95 backdrop-blur-xl rounded-xl border border-[var(--border-color)] shadow-2xl p-4 min-w-[280px] max-w-[350px]"
            style={{
              left: Math.min(x, window.innerWidth - 370),
              top: Math.min(y + 10, window.innerHeight - 250)
            }}
            onMouseEnter={() => setHoveredConnection(hoveredConnection)}
            onMouseLeave={() => setHoveredConnection(null)}
          >
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--border-color)]/50">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getConnectionTypeColor(connection.type) }} />
              <h5 className="text-sm font-semibold text-[var(--foreground)]">
                {connection.type.toUpperCase()} 连接
              </h5>
            </div>

            <div className="space-y-2 text-xs">
              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                <div className="text-[var(--text-secondary)] mb-1">连接标签</div>
                <div className="text-sm font-medium text-[var(--foreground)]">{connection.label}</div>
              </div>

              {connection.protocol && (
                <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                  <div className="text-[var(--text-secondary)] mb-1">协议</div>
                  <div className="text-sm font-medium text-[var(--foreground)]">{connection.protocol}</div>
                </div>
              )}

              <div className="bg-[var(--background)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                <div className="text-[var(--text-secondary)] mb-1">话单ID</div>
                <div className="text-sm font-medium text-[var(--foreground)] break-all">{connection.entry.logID}</div>
              </div>
            </div>

            {onEntryClick && (
              <div className="mt-3 pt-3 border-t border-[var(--border-color)]/50">
                <button
                  className="w-full flex items-center justify-center gap-2 text-xs font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] focus:outline-none transition-colors py-2 px-3 rounded-lg hover:bg-[var(--accent-blue)]/10"
                  onClick={() => handleConnectionClick(connection)}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  查看详情
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      );
    }

    return null;
  };

  const renderControls = () => {
    return (
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          whileHover={{ scale: 1.1, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(MAX_ZOOM, prev.scale * 1.2) }))}
          className="w-10 h-10 rounded-full bg-[var(--card-background)]/90 backdrop-blur-xl border border-[var(--border-color)]/40 flex items-center justify-center text-[var(--foreground)] hover:bg-[var(--card-background)] transition-all duration-200 shadow-lg"
          title="放大"
        >
          <ZoomIn className="w-5 h-5" />
        </motion.button>
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.55 }}
          whileHover={{ scale: 1.1, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(MIN_ZOOM, prev.scale * 0.8) }))}
          className="w-10 h-10 rounded-full bg-[var(--card-background)]/90 backdrop-blur-xl border border-[var(--border-color)]/40 flex items-center justify-center text-[var(--foreground)] hover:bg-[var(--card-background)] transition-all duration-200 shadow-lg"
          title="缩小"
        >
          <ZoomOut className="w-5 h-5" />
        </motion.button>
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          whileHover={{ scale: 1.1, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleResetView}
          className="w-10 h-10 rounded-full bg-[var(--card-background)]/90 backdrop-blur-xl border border-[var(--border-color)]/40 flex items-center justify-center text-[var(--foreground)] hover:bg-[var(--card-background)] transition-all duration-200 shadow-lg"
          title="重置视图"
        >
          <RefreshCw className="w-5 h-5" />
        </motion.button>
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.65 }}
          whileHover={{ scale: 1.1, y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOverviewVisible(!isOverviewVisible)}
          className={`w-10 h-10 rounded-full backdrop-blur-xl border flex items-center justify-center text-[var(--foreground)] hover:bg-[var(--card-background)] transition-all duration-200 shadow-lg ${
            isOverviewVisible 
              ? 'bg-[var(--accent-blue)]/20 border-[var(--accent-blue)]/40' 
              : 'bg-[var(--card-background)]/90 border-[var(--border-color)]/40'
          }`}
          title={isOverviewVisible ? "隐藏缩略图" : "显示缩略图"}
        >
          <div className="w-4 h-4 grid grid-cols-2 gap-0.5">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i} 
                className="w-1.5 h-1.5 rounded-sm" 
                style={{ 
                  backgroundColor: isOverviewVisible 
                    ? 'var(--accent-blue)' 
                    : 'var(--foreground)'
                }}
              />
            ))}
          </div>
        </motion.button>
      </div>
    );
  };

  const renderLegend = () => {
    return (
      <div className={`${isOverviewVisible ? 'mr-4' : ''} bg-[var(--card-background)]/90 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/40 p-3 shadow-lg`}>
        <div className="text-xs font-semibold text-[var(--foreground)] mb-2">图例</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor('server') }} />
            <span className="text-xs text-[var(--text-secondary)]">服务器</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor('mcp') }} />
            <span className="text-xs text-[var(--text-secondary)]">MCP服务</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor('http') }} />
            <span className="text-xs text-[var(--text-secondary)]">HTTP服务</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor('file') }} />
            <span className="text-xs text-[var(--text-secondary)]">高风险文件</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor('exec') }} />
            <span className="text-xs text-[var(--text-secondary)]">命令执行</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeTypeColor('openclaw') }} />
            <span className="text-xs text-[var(--text-secondary)]">OpenClaw</span>
          </div>
        </div>
      </div>
    );
  };

  const renderStats = () => {
    return (
      <div className="absolute bottom-4 left-4 bg-[var(--card-background)]/90 backdrop-blur-xl rounded-xl border border-[var(--border-color)]/40 p-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-blue-hover) 100%)' }}>
              <Network className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">节点</div>
              <div className="text-sm font-bold text-[var(--foreground)]">{topologyData.nodes.length}</div>
            </div>
          </div>
          <div className="w-px h-8 bg-[var(--border-color)]/30" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>
              <Clock className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">连接</div>
              <div className="text-sm font-bold text-[var(--foreground)]">{topologyData.connections.length}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderOverview = () => {
    if (!isOverviewVisible || topologyData.nodes.length === 0) return null;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-40 h-32 bg-[var(--card-background)]/80 backdrop-blur-xl rounded-xl shadow-lg overflow-hidden"
        ref={overviewRef}
      >
        <div className="text-xs font-semibold text-[var(--foreground)] p-2">
          缩略图
        </div>
        <div className="w-full h-[calc(100%-24px)] relative">
          <svg width="100%" height="100%" viewBox="0 0 1000 750">
            {/* 绘制节点 */}
            {topologyData.nodes.map(node => {
              const color = getNodeTypeColor(node.type);
              const x = (node.x / canvasSize.width) * 1000 + 500;
              const y = (node.y / canvasSize.height) * 750 + 375;
              return (
                <rect
                  key={node.id}
                  x={x - 5}
                  y={y - 3}
                  width={10}
                  height={6}
                  rx={2}
                  fill={color}
                  style={{ opacity: 0.7 }}
                />
              );
            })}
            {/* 绘制连接 */}
            {topologyData.connections.map(connection => {
              const sourceNode = topologyData.nodes.find(n => n.id === connection.sourceId);
              const targetNode = topologyData.nodes.find(n => n.id === connection.targetId);
              if (!sourceNode || !targetNode) return null;
              const color = getConnectionTypeColor(connection.type);
              const sourceX = (sourceNode.x / canvasSize.width) * 1000 + 500;
              const sourceY = (sourceNode.y / canvasSize.height) * 750 + 375;
              const targetX = (targetNode.x / canvasSize.width) * 1000 + 500;
              const targetY = (targetNode.y / canvasSize.height) * 750 + 375;
              return (
                <path
                  key={connection.id}
                  d={`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1}
                  style={{ opacity: 0.5 }}
                />
              );
            })}
            {/* 绘制视口框 */}
            <rect
              x={20}
              y={20}
              width={960 * (1 / transform.scale)}
              height={710 * (1 / transform.scale)}
              rx={2}
              fill="none"
              strokeWidth={2}
              style={{ opacity: 0.8 }}
            />
          </svg>
        </div>
      </motion.div>
    );
  };

  const renderTopControls = () => {
    return (
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {isOverviewVisible && renderOverview()}
        {renderLegend()}
      </div>
    );
  };

  if (topologyData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
          style={{
            background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-blue-hover) 100%)',
            boxShadow: '0 16px 40px -12px rgba(41, 151, 255, 0.35)'
          }}
        >
          <Network className="w-10 h-10 text-white" />
        </motion.div>
        <h4 className="text-lg font-bold text-[var(--foreground)] mb-2">暂无拓扑数据</h4>
        <p className="text-sm text-[var(--text-secondary)]">当前会话没有可显示的节点和连接</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(41, 151, 255, 0.03) 0%, rgba(0, 0, 0, 0) 100%)',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <g transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'} strokeWidth="1" />
            </pattern>
          </defs>
          
          <rect
            x={-canvasSize.width}
            y={-canvasSize.height}
            width={canvasSize.width * 3}
            height={canvasSize.height * 3}
            fill="url(#grid)"
          />

          {renderConnections()}
          {topologyData.nodes.map(renderNode)}
        </g>
      </svg>

      {renderControls()}
      {renderTopControls()}
      {renderStats()}
      {renderTooltip()}
    </div>
  );
}
