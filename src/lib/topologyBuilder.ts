import { ParsedLogEntry } from '@/types/log';
import { AggregatedSession } from './sessionAggregator';
import { TopologyData, TopologyNode, TopologyConnection, NodeType, ConnectionType } from '@/types/topology';

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

// 节点尺寸常量
const NODE_WIDTH = 160;
const NODE_HEIGHT = 80;
const MIN_NODE_SPACING = 15;
const MAX_NODE_SPACING = 30;
const NODE_BUFFER = (MIN_NODE_SPACING + MAX_NODE_SPACING) / 2;

// 紧凑布局算法参数
const SPRING_STRENGTH = 0.005;
const REPULSION_STRENGTH = 1000;
const DAMPING = 1.5;
const ITERATIONS = 50;
const MAX_LAYOUT_TIME = 200; // 最大布局计算时间（毫秒）

// 四叉树节点类，用于空间分区以优化力导向计算
class QuadTreeNode {
  bounds: { x: number; y: number; width: number; height: number };
  nodes: TopologyNode[];
  children: QuadTreeNode[];
  capacity: number;

  constructor(bounds: { x: number; y: number; width: number; height: number }, capacity: number = 4) {
    this.bounds = bounds;
    this.nodes = [];
    this.children = [];
    this.capacity = capacity;
  }

  subdivide() {
    const { x, y, width, height } = this.bounds;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    this.children = [
      new QuadTreeNode({ x, y, width: halfWidth, height: halfHeight }),
      new QuadTreeNode({ x: x + halfWidth, y, width: halfWidth, height: halfHeight }),
      new QuadTreeNode({ x, y: y + halfHeight, width: halfWidth, height: halfHeight }),
      new QuadTreeNode({ x: x + halfWidth, y: y + halfHeight, width: halfWidth, height: halfHeight })
    ];
  }

  insert(node: TopologyNode): boolean {
    if (!this.contains(node)) return false;

    if (this.nodes.length < this.capacity && this.children.length === 0) {
      this.nodes.push(node);
      return true;
    }

    if (this.children.length === 0) {
      this.subdivide();
    }

    for (const child of this.children) {
      if (child.insert(node)) {
        return true;
      }
    }

    return false;
  }

  contains(node: TopologyNode): boolean {
    return (
      node.x >= this.bounds.x &&
      node.x <= this.bounds.x + this.bounds.width &&
      node.y >= this.bounds.y &&
      node.y <= this.bounds.y + this.bounds.height
    );
  }

  query(range: { x: number; y: number; width: number; height: number }, found: TopologyNode[]): void {
    if (!this.intersects(range)) return;

    for (const node of this.nodes) {
      if (
        node.x >= range.x &&
        node.x <= range.x + range.width &&
        node.y >= range.y &&
        node.y <= range.y + range.height
      ) {
        found.push(node);
      }
    }

    for (const child of this.children) {
      child.query(range, found);
    }
  }

  intersects(range: { x: number; y: number; width: number; height: number }): boolean {
    return !(range.x > this.bounds.x + this.bounds.width ||
             range.x + range.width < this.bounds.x ||
             range.y > this.bounds.y + this.bounds.height ||
             range.y + range.height < this.bounds.y);
  }
}

// 构建四叉树
const buildQuadTree = (nodes: TopologyNode[]): QuadTreeNode => {
  if (nodes.length === 0) {
    return new QuadTreeNode({ x: 0, y: 0, width: 1000, height: 1000 });
  }

  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));

  const padding = 100;
  const bounds = {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2
  };

  const root = new QuadTreeNode(bounds);
  nodes.forEach(node => root.insert(node));
  return root;
};

// 紧凑布局算法
const performCompactLayout = (nodes: TopologyNode[], connections: TopologyConnection[]): void => {
  const startTime = Date.now();
  const velocities = new Map<string, { vx: number; vy: number }>();

  // 初始化速度
  nodes.forEach(node => {
    velocities.set(node.id, { vx: 0, vy: 0 });
  });

  // 力导向布局迭代
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // 检查是否超过最大布局时间
    if (Date.now() - startTime > MAX_LAYOUT_TIME) {
      break;
    }

    // 构建四叉树以优化力计算
    const quadTree = buildQuadTree(nodes);

    // 重置速度（应用阻尼）
    nodes.forEach(node => {
      const v = velocities.get(node.id)!;
      v.vx *= DAMPING;
      v.vy *= DAMPING;
    });

    // 1. 计算排斥力（使用四叉树优化）
    nodes.forEach(node => {
      const v = velocities.get(node.id)!;
      const queryRange = {
        x: node.x - 200,
        y: node.y - 200,
        width: 400,
        height: 400
      };

      const nearbyNodes: TopologyNode[] = [];
      quadTree.query(queryRange, nearbyNodes);

      nearbyNodes.forEach(otherNode => {
        if (node.id === otherNode.id) return;

        const dx = otherNode.x - node.x;
        const dy = otherNode.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // 计算排斥力，确保节点间距不小于最小间距
          const minDistance = NODE_WIDTH + NODE_BUFFER;
          const force = distance < minDistance 
            ? REPULSION_STRENGTH / (distance * distance) * 10
            : REPULSION_STRENGTH / (distance * distance);

          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          v.vx -= fx;
          v.vy -= fy;
        }
      });
    });

    // 2. 计算吸引力（基于连接）
    connections.forEach(conn => {
      const sourceNode = nodes.find(n => n.id === conn.sourceId);
      const targetNode = nodes.find(n => n.id === conn.targetId);

      if (sourceNode && targetNode) {
        const vSource = velocities.get(sourceNode.id)!;
        const vTarget = velocities.get(targetNode.id)!;

        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
          // 计算理想距离（节点宽度 + 最佳间距）
          const idealDistance = NODE_WIDTH + (MIN_NODE_SPACING + MAX_NODE_SPACING) / 2;
          // 计算弹簧力，根据当前距离与理想距离的差值
          const force = (distance - idealDistance) * SPRING_STRENGTH;

          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          vSource.vx += fx;
          vSource.vy += fy;
          vTarget.vx -= fx;
          vTarget.vy -= fy;
        }
      }
    });

    // 3. 更新节点位置
    nodes.forEach(node => {
      const v = velocities.get(node.id)!;
      // 限制最大速度，避免节点跳动
      const maxSpeed = 10;
      const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        v.vx *= ratio;
        v.vy *= ratio;
      }
      // 更新位置
      node.x += v.vx;
      node.y += v.vy;
    });
  }
};

// 初始布局 - 基于节点关系的层次布局
const performInitialLayout = (nodes: TopologyNode[], connections: TopologyConnection[]): void => {
  // 构建节点关系图
  const nodeMap = new Map<string, TopologyNode>();
  const adjacencyList = new Map<string, string[]>();

  nodes.forEach(node => {
    nodeMap.set(node.id, node);
    adjacencyList.set(node.id, []);
  });

  connections.forEach(conn => {
    if (adjacencyList.has(conn.sourceId)) {
      adjacencyList.get(conn.sourceId)!.push(conn.targetId);
    }
    if (adjacencyList.has(conn.targetId)) {
      adjacencyList.get(conn.targetId)!.push(conn.sourceId);
    }
  });

  // 计算节点层级（基于中心度）
  const degrees = new Map<string, number>();
  nodes.forEach(node => {
    degrees.set(node.id, adjacencyList.get(node.id)!.length);
  });

  // 按度数排序，度数高的节点放在中心
  const sortedNodes = [...nodes].sort((a, b) => 
    (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0)
  );

  // 初始布局：中心放射状
  const centerX = 0;
  const centerY = 0;
  const radius = 50;

  sortedNodes.forEach((node, index) => {
    if (index === 0) {
      // 中心节点
      node.x = centerX;
      node.y = centerY;
    } else {
      // 围绕中心节点排列
      const angle = (index - 1) * (Math.PI * 2 / (sortedNodes.length - 1));
      node.x = centerX + Math.cos(angle) * radius * Math.ceil(Math.sqrt(index));
      node.y = centerY + Math.sin(angle) * radius * Math.ceil(Math.sqrt(index));
    }
  });
};

// 居中布局
const centerLayout = (nodes: TopologyNode[]): void => {
  if (nodes.length === 0) return;

  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y));

  const centerOffsetX = -(maxX + minX) / 2;
  const centerOffsetY = -(maxY + minY) / 2;

  nodes.forEach(node => {
    node.x += centerOffsetX;
    node.y += centerOffsetY;
  });
};

export const buildTopologyData = (session: AggregatedSession): TopologyData => {
  const nodes: Map<string, TopologyNode> = new Map();
  const connections: TopologyConnection[] = [];

  const fileNodeMap: Map<string, { nodeId: string; entries: ParsedLogEntry[] }> = new Map();
  const connectionMap: Map<string, ParsedLogEntry> = new Map();

  // 1. 构建节点和连接
  session.allEntries.forEach(entry => {
    const dataType = entry.dataType;
    const sourceIp = entry.reqIp || 'unknown';
    const destIp = entry.respIp || 'unknown';
    const sourcePort = entry.reqPort || '0';
    const destPort = entry.respPort || '0';

    if (dataType === 'FILE') {
      const sourceNodeId = `${sourceIp}:${sourcePort}`;
      const decodedPath = decodeBase64(entry.answer);
      const fileName = decodedPath ? decodedPath.split(/[\\/]/).pop() || decodedPath : '未知';
      const fileKey = `file:${fileName}`;
      const connectionKey = `${sourceNodeId}->${fileKey}`;

      if (!nodes.has(sourceNodeId)) {
        nodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'server',
          label: `${sourceIp}:${sourcePort}`,
          ip: sourceIp,
          port: sourcePort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(sourceNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      if (!fileNodeMap.has(fileKey)) {
        fileNodeMap.set(fileKey, { nodeId: fileKey, entries: [entry] });
        const riskLevel = entry.llmProvider === 'HIGH' ? '高风险' : entry.llmProvider === 'MEDIUM' ? '中风险' : '低风险';
        nodes.set(fileKey, {
          id: fileKey,
          type: 'file',
          label: `文件: ${fileName} (${riskLevel})`,
          ip: '',
          port: '',
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const fileNode = fileNodeMap.get(fileKey)!;
        if (!fileNode.entries.find(e => e.logID === entry.logID)) {
          fileNode.entries.push(entry);
          const node = nodes.get(fileKey)!;
          node.entries = fileNode.entries;
        }
      }

      if (!connectionMap.has(connectionKey)) {
        connectionMap.set(connectionKey, entry);
        connections.push({
          id: `conn-${connectionKey.replace(/[^a-zA-Z0-9]/g, '_')}`,
          type: 'file',
          sourceId: sourceNodeId,
          targetId: fileKey,
          entry,
          label: `${entry.pName || '文件'}`
        });
      }
    } else if (dataType === 'AG-UI') {
      const sourceNodeId = `${sourceIp}:${sourcePort}`;
      const destNodeId = `${destIp}:${destPort}`;

      if (!nodes.has(sourceNodeId)) {
        nodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'server',
          label: `${sourceIp}:${sourcePort}`,
          ip: sourceIp,
          port: sourcePort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(sourceNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      if (!nodes.has(destNodeId)) {
        nodes.set(destNodeId, {
          id: destNodeId,
          type: 'server',
          label: `${destIp}:${destPort}`,
          ip: destIp,
          port: destPort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(destNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      connections.push({
        id: `conn-${entry.logID}`,
        type: 'agui',
        sourceId: sourceNodeId,
        targetId: destNodeId,
        entry,
        label: `AG-UI :${sourcePort}→:${destPort}`,
        protocol: 'AG-UI'
      });
    } else if (dataType === 'MCP') {
      const sourceNodeId = `${sourceIp}:${sourcePort}`;
      const destNodeId = `mcp:${entry.mcpServerName || destIp}`;

      if (!nodes.has(sourceNodeId)) {
        nodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'server',
          label: `${sourceIp}:${sourcePort}`,
          ip: sourceIp,
          port: sourcePort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(sourceNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      if (!nodes.has(destNodeId)) {
        nodes.set(destNodeId, {
          id: destNodeId,
          type: 'mcp',
          label: `MCP: ${entry.mcpServerName || destIp}`,
          ip: destIp,
          port: destPort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(destNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      connections.push({
        id: `conn-${entry.logID}`,
        type: 'mcp',
        sourceId: sourceNodeId,
        targetId: destNodeId,
        entry,
        label: `MCP ${entry.mcpMethod || '调用'}`,
        protocol: 'MCP'
      });
    } else if (dataType === 'HTTP') {
      const sourceNodeId = `${sourceIp}:${sourcePort}`;
      const destNodeId = `http:${destIp}`;

      if (!nodes.has(sourceNodeId)) {
        nodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'server',
          label: `${sourceIp}:${sourcePort}`,
          ip: sourceIp,
          port: sourcePort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(sourceNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      if (!nodes.has(destNodeId)) {
        nodes.set(destNodeId, {
          id: destNodeId,
          type: 'http',
          label: `HTTP: ${destIp}`,
          ip: destIp,
          port: destPort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(destNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      connections.push({
        id: `conn-${entry.logID}`,
        type: 'http',
        sourceId: sourceNodeId,
        targetId: destNodeId,
        entry,
        label: `HTTP :${sourcePort}→:${destPort}`,
        protocol: 'HTTP'
      });
    } else if (dataType === 'OPENCLAW') {
      const sourceNodeId = `${sourceIp}:${sourcePort}`;
      const destNodeId = `${destIp}:${destPort}`;

      if (!nodes.has(sourceNodeId)) {
        nodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'server',
          label: `${sourceIp}:${sourcePort}`,
          ip: sourceIp,
          port: sourcePort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(sourceNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      if (!nodes.has(destNodeId)) {
        nodes.set(destNodeId, {
          id: destNodeId,
          type: 'server',
          label: `${destIp}:${destPort}`,
          ip: destIp,
          port: destPort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(destNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      connections.push({
        id: `conn-${entry.logID}`,
        type: 'openclaw',
        sourceId: sourceNodeId,
        targetId: destNodeId,
        entry,
        label: `OPENCLAW :${sourcePort}→:${destPort}`,
        protocol: 'OPENCLAW'
      });
    } else if (dataType === 'TOOLCALL') {
      const sourceNodeId = `${sourceIp}:${sourcePort}`;
      const destNodeId = `${destIp}:${destPort}`;

      if (!nodes.has(sourceNodeId)) {
        nodes.set(sourceNodeId, {
          id: sourceNodeId,
          type: 'server',
          label: `${sourceIp}:${sourcePort}`,
          ip: sourceIp,
          port: sourcePort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(sourceNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      if (!nodes.has(destNodeId)) {
        nodes.set(destNodeId, {
          id: destNodeId,
          type: 'server',
          label: `${destIp}:${destPort}`,
          ip: destIp,
          port: destPort,
          x: 0,
          y: 0,
          entries: [entry]
        });
      } else {
        const node = nodes.get(destNodeId)!;
        if (!node.entries.find(e => e.logID === entry.logID)) {
          node.entries.push(entry);
        }
      }

      const tcToolName = entry.toolName || 'tool';
      connections.push({
        id: `conn-${entry.logID}`,
        type: 'toolcall',
        sourceId: sourceNodeId,
        targetId: destNodeId,
        entry,
        label: `🔧 ${tcToolName}`,
        protocol: 'TOOLCALL'
      });
    }
  });

  // 2. 过滤高风险文件节点
  const highRiskFileNodeIds = new Set<string>();
  fileNodeMap.forEach(({ entries }, fileKey) => {
    entries.forEach(entry => {
      if (entry.llmProvider === 'HIGH') {
        highRiskFileNodeIds.add(fileKey);
      }
    });
  });

  const filteredNodes = Array.from(nodes.values()).filter(node => {
    if (node.type === 'file') {
      return highRiskFileNodeIds.has(node.id);
    }
    return true;
  });

  const filteredConnections = connections.filter(conn => {
    const sourceNode = nodes.get(conn.sourceId);
    const targetNode = nodes.get(conn.targetId);
    return sourceNode && targetNode && 
           (sourceNode.type !== 'file' || highRiskFileNodeIds.has(sourceNode.id)) &&
           (targetNode.type !== 'file' || highRiskFileNodeIds.has(targetNode.id));
  });

  // 3. 执行初始布局
  performInitialLayout(filteredNodes, filteredConnections);

  // 4. 执行紧凑布局
  performCompactLayout(filteredNodes, filteredConnections);

  // 5. 居中布局
  centerLayout(filteredNodes);

  return {
    nodes: filteredNodes,
    connections: filteredConnections
  };
};

export const getNodeTypeColor = (type: NodeType): string => {
  switch (type) {
    case 'server':
      return 'var(--accent-blue)';
    case 'mcp':
      return '#eab308';
    case 'http':
      return '#22c55e';
    case 'file':
      return '#f97316';
    case 'exec':
      return '#6366f1';
    case 'openclaw':
      return '#06b6d4';
    default:
      return '#6b7280';
  }
};

export const getConnectionTypeColor = (type: ConnectionType): string => {
  switch (type) {
    case 'agui':
      return 'var(--accent-blue)';
    case 'mcp':
      return '#eab308';
    case 'http':
      return '#22c55e';
    case 'file':
      return '#f97316';
    case 'openclaw':
      return '#a855f7';
    case 'toolcall':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
};

// 获取连接层级，用于视觉上的主次关系显示
export const getConnectionLevel = (connection: TopologyConnection): number => {
  switch (connection.type) {
    case 'agui':
      return 1;
    case 'openclaw':
      return 1;
    case 'mcp':
      return 2;
    case 'http':
      return 2;
    case 'file':
      return 1;
    default:
      return 3;
  }
};

// 获取连接线宽
export const getConnectionLineWidth = (connection: TopologyConnection): number => {
  const level = getConnectionLevel(connection);
  switch (level) {
    case 1:
      return 3;
    case 2:
      return 2;
    case 3:
      return 1;
    default:
      return 1;
  }
};

