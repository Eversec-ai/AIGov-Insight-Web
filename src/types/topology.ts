import { ParsedLogEntry } from '@/types/log';

export type NodeType = 'server' | 'mcp' | 'http' | 'file' | 'exec' | 'openclaw' | 'toolcall';

export type ConnectionType = 'agui' | 'mcp' | 'http' | 'file' | 'openclaw' | 'toolcall';

export interface TopologyNode {
  id: string;
  type: NodeType;
  label: string;
  ip: string;
  port: string;
  x: number;
  y: number;
  entries: ParsedLogEntry[];
}

export interface TopologyConnection {
  id: string;
  type: ConnectionType;
  sourceId: string;
  targetId: string;
  entry: ParsedLogEntry;
  label: string;
  protocol?: string;
}

export interface TopologyData {
  nodes: TopologyNode[];
  connections: TopologyConnection[];
}

export interface ViewportTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface NodePosition {
  x: number;
  y: number;
}
