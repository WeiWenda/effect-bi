import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  Handle,
  Position,
  NodeTypes,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronLeft, ChevronRight, Plus, Minus, ExternalLink, Eye, EyeOff, Check, MoreVerticalIcon } from 'lucide-react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { lineageAPI, LineageNode, LineagePath, LineageRelationship } from '../../services/lineageApi';
import {
  lineageEntityRouteTableName,
  lineageTableDescription,
  lineageTableNodeLabel,
  lineageTableLayer,
} from '../../services/lineageNodeMeta';
import { dagAPI } from '../../services/dagApi';
import { LineageConfigPanel, LineageConfig } from './LineageConfigPanel';
import { HiddenNodesPanel } from './HiddenNodesPanel';
import { LineageNodeTableLabel } from './LineageNodeTableLabel';
import { LINEAGE_GRAPH_NODE_BOX_CLASS, LINEAGE_GRAPH_NODE_WIDTH } from './lineageGraphNodeLayout';
import { useToast } from '../ui/toast';

interface LineageGraphTabProps {
  entityId: string;
  tableName: string;
  /** 用于详情页 URL、与 /lineage/entity?tableName= 一致 */
  routeTableName: string;
  /** 中心表 Neo4j 属性（catalog/database、catalog_type 等） */
  centerProperties?: Record<string, unknown>;
}

function findCenterPropertiesInPaths(
  paths: LineagePath[],
  entityId: string
): Record<string, unknown> | undefined {
  for (const path of paths) {
    const node = path.nodes.find(n => n.id === entityId);
    if (node?.properties) return node.properties as Record<string, unknown>;
  }
  return undefined;
}

function buildCenterNodeDisplay(
  entityId: string,
  routeTableName: string,
  properties?: Record<string, unknown>
): Pick<NodeData, 'label' | 'routeTableName' | 'layer' | 'description' | 'entityId'> {
  if (properties) {
    return {
      label: lineageTableNodeLabel(properties),
      routeTableName: lineageEntityRouteTableName(properties),
      layer: lineageTableLayer(properties),
      description: lineageTableDescription(properties),
      entityId,
    };
  }
  return { label: routeTableName, routeTableName, entityId };
}

/** 从中心表沿 MAKEUP 边求最短跳数（层深）；上下游分开，互不占名额 */
function computeHopDepthsFromEdges(
  centerId: string,
  edges: Array<{ source: string; target: string }>,
  direction: 'upstream' | 'downstream'
): Map<string, number> {
  const relaxEdges: Array<[string, string]> = [];
  for (const e of edges) {
    if (direction === 'downstream') {
      relaxEdges.push([e.source, e.target]);
    } else {
      relaxEdges.push([e.target, e.source]);
    }
  }

  const depths = new Map<string, number>();
  depths.set(centerId, 0);

  let changed = true;
  let guard = 0;
  while (changed && guard < 64) {
    guard += 1;
    changed = false;
    for (const [from, to] of relaxEdges) {
      const fromDepth = depths.get(from);
      if (fromDepth === undefined) continue;
      const nextDepth = fromDepth + 1;
      const prev = depths.get(to);
      if (prev === undefined || nextDepth < prev) {
        depths.set(to, nextDepth);
        changed = true;
      }
    }
  }
  return depths;
}

function computeHopDepths(
  centerId: string,
  paths: LineagePath[],
  direction: 'upstream' | 'downstream'
): Map<string, number> {
  const edges = paths.flatMap(path =>
    path.relationships.map(rel => ({ source: rel.startNodeId, target: rel.endNodeId }))
  );
  return computeHopDepthsFromEdges(centerId, edges, direction);
}

/** 按层深分组，每层仅保留前 limit 个（按首次出现顺序） */
function hiddenIdsBeyondPerLayerLimit(
  orderByFirstAppearance: string[],
  depths: Map<string, number>,
  limit: number
): Set<string> {
  const countAtDepth = new Map<number, number>();
  const hidden = new Set<string>();
  for (const id of orderByFirstAppearance) {
    const depth = depths.get(id) ?? 1;
    if (depth <= 0) continue;
    const seen = countAtDepth.get(depth) ?? 0;
    if (seen >= limit) {
      hidden.add(id);
    } else {
      countAtDepth.set(depth, seen + 1);
    }
  }
  return hidden;
}

const LINEAGE_GRAPH_CONFIG_KEY = 'lineage-graph-config';

const DEFAULT_LINEAGE_CONFIG: LineageConfig = {
  upstreamDepth: 1,
  downstreamDepth: 1,
  limit: 5,
};

function readStoredLineageConfig(): LineageConfig {
  try {
    const raw = localStorage.getItem(LINEAGE_GRAPH_CONFIG_KEY);
    if (!raw) return DEFAULT_LINEAGE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LineageConfig>;
    return {
      upstreamDepth: Math.min(5, Math.max(1, Number(parsed.upstreamDepth) || 1)),
      downstreamDepth: Math.min(5, Math.max(1, Number(parsed.downstreamDepth) || 1)),
      limit: Math.min(500, Math.max(1, Number(parsed.limit) || 5)),
    };
  } catch {
    return DEFAULT_LINEAGE_CONFIG;
  }
}

/** 按方向 + 跳数重新计算 hidden（每层各 limit 个） */
function applyPerLayerDisplayLimits(
  nodes: Node[],
  edges: Edge[],
  centerId: string,
  limit: number
): Node[] {
  const upstreamOrder = nodes.filter(n => n.data.direction === 'upstream').map(n => n.id);
  const downstreamOrder = nodes.filter(n => n.data.direction === 'downstream').map(n => n.id);
  const upstreamDepths = computeHopDepthsFromEdges(centerId, edges, 'upstream');
  const downstreamDepths = computeHopDepthsFromEdges(centerId, edges, 'downstream');
  const hiddenUpstream = hiddenIdsBeyondPerLayerLimit(upstreamOrder, upstreamDepths, limit);
  const hiddenDownstream = hiddenIdsBeyondPerLayerLimit(downstreamOrder, downstreamDepths, limit);

  return nodes.map(node => {
    if (node.data.isCenter || node.data.direction === 'center') {
      return { ...node, data: { ...node.data, hidden: false } };
    }
    const dir = node.data.direction as string;
    const hidden =
      dir === 'upstream'
        ? hiddenUpstream.has(node.id)
        : dir === 'downstream'
          ? hiddenDownstream.has(node.id)
          : Boolean(node.data.hidden);
    const hop =
      dir === 'upstream'
        ? upstreamDepths.get(node.id)
        : dir === 'downstream'
          ? downstreamDepths.get(node.id)
          : undefined;
    return {
      ...node,
      data: {
        ...node.data,
        hidden,
        ...(hop !== undefined ? { level: hop } : {}),
      },
    };
  });
}

interface NodeData {
  label: string;
  /** 新开标签页用；缺省与 label 相同 */
  routeTableName?: string;
  layer?: string;
  description?: string;
  entityId: string;
  isCenter: boolean;
  direction: 'upstream' | 'downstream' | 'center';
  level: number;
  loaded: {
    upstream: boolean;
    downstream: boolean;
  };
  hidden?: boolean;
  selected?: boolean;
  visible?: boolean;
  collapsed?: {
    upstream: boolean;
    downstream: boolean;
  };
}

const CustomNode = ({ data, onToggleHide, onToggleSelect, onToggleCollapse, onLoadDownstream, onLoadUpstream }: { data: NodeData; onToggleHide?: (nodeId: string) => void; onToggleSelect?: (nodeId: string) => void; onToggleCollapse?: (nodeId: string, direction: 'upstream' | 'downstream') => void; onLoadDownstream?: (nodeId: string) => void; onLoadUpstream?: (nodeId: string) => void }) => {
  const handleOpenNewPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Open new page with current node as center
    const key = encodeURIComponent(data.routeTableName ?? data.label);
    window.open(`/lineage/table/${key}`, '_blank');
  };

  const showLeftButton = data.isCenter || data.direction === 'upstream';
  const showRightButton = data.isCenter || data.direction === 'downstream';

  let nodeClass = 'bg-white border-gray-200';
  if (data.isCenter) {
    nodeClass = 'bg-blue-50 border-blue-400';
  } else if (data.selected) {
    nodeClass = 'bg-green-50 border-green-400';
  }

  const handleLeftButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Check if upstream nodes are loaded
    if (data.loaded?.upstream && !data.collapsed?.upstream) {
      // If loaded and not collapsed, collapse them
      onToggleCollapse?.(data.entityId, 'upstream');
    } else {
      // If not loaded or collapsed, load/expand them
      onLoadUpstream?.(data.entityId);
    }
  };

  const handleRightButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Check if downstream nodes are loaded
    if (data.loaded?.downstream && !data.collapsed?.downstream) {
      // If loaded and not collapsed, collapse them
      onToggleCollapse?.(data.entityId, 'downstream');
    } else {
      // If not loaded or collapsed, load/expand them
      onLoadDownstream?.(data.entityId);
    }
  };

  return (
    <div className={`${LINEAGE_GRAPH_NODE_BOX_CLASS} ${nodeClass}`}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <LineageNodeTableLabel name={data.label} />
      {data.description && (
        <div className="mb-1 w-full min-w-0 truncate text-xs text-gray-600">{data.description}</div>
      )}
      {data.layer && (
        <div className="text-xs text-gray-500">{data.layer}</div>
      )}

      <div className="flex gap-1 mt-2 flex-wrap">
        {showLeftButton && (
          <button
            onClick={handleLeftButtonClick}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title={data.loaded?.upstream && !data.collapsed?.upstream ? "收起上游" : "加载上游"}
          >
            <ChevronLeft className="size-3 text-gray-500" />
          </button>
        )}
        {showRightButton && (
          <button
            onClick={handleRightButtonClick}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title={data.loaded?.downstream && !data.collapsed?.downstream ? "收起下游" : "加载下游"}
          >
            <ChevronRight className="size-3 text-gray-500" />
          </button>
        )}
        <button
          onClick={handleOpenNewPage}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="在新页面打开"
        >
          <ExternalLink className="size-3 text-gray-500" />
        </button>
        {!data.isCenter && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleHide?.(data.entityId);
              }}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={data.hidden ? "显示" : "隐藏"}
            >
              {data.hidden ? <EyeOff className="size-3 text-gray-500" /> : <Eye className="size-3 text-gray-500" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(data.entityId);
              }}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title={data.selected ? "取消选中" : "选中"}
            >
              {data.selected ? <Check className="size-3 text-gray-500" /> : <Plus className="size-3 text-gray-500" />}
            </button>
          </>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
    </div>
  );
};

export function LineageGraphTab({
  entityId,
  tableName,
  routeTableName,
  centerProperties,
}: LineageGraphTabProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <LineageGraphContent
        entityId={entityId}
        tableName={tableName}
        routeTableName={routeTableName}
        centerProperties={centerProperties}
      />
    </ReactFlowProvider>
  );
}

const createNodeTypes = (onToggleHide?: (nodeId: string) => void, onToggleSelect?: (nodeId: string) => void, onToggleCollapse?: (nodeId: string, direction: 'upstream' | 'downstream') => void, onLoadDownstream?: (nodeId: string) => void, onLoadUpstream?: (nodeId: string) => void): NodeTypes => ({
  custom: (props) => <CustomNode {...props} onToggleHide={onToggleHide} onToggleSelect={onToggleSelect} onToggleCollapse={onToggleCollapse} onLoadDownstream={onLoadDownstream} onLoadUpstream={onLoadUpstream} />,
});

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '130',
  'elk.spacing.nodeNode': '80',
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], options = {}): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  let visibleNodes = nodes.filter(n => !n.data.hidden && n.data.visible !== false);

  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

  const graph = {
    id: 'root',
    layoutOptions: options,
    children: visibleNodes.map((node) => ({
      ...node,
      targetPosition: 'left',
      sourcePosition: 'right',
      width: LINEAGE_GRAPH_NODE_WIDTH,
      height: 50,
    })),
    edges: visibleEdges.map((edge) => ({
      ...edge,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  return elk
    .layout(graph)
    .then((layoutedGraph) => ({
      nodes: (layoutedGraph.children || []).map((node) => ({
            ...node,
        position: { x: node.x || 0, y: node.y || 0 },
      })),
        edges: (layoutedGraph.edges || []).map((edge) => ({
          id: edge.id,
          source: edge.sources[0],
          target: edge.targets[0],
          type: 'smoothstep',
          animated: true,
        })),
    }))
    .catch((error) => {
      console.error(error);
      return { nodes: [], edges: [] };
    });
};

const LineageGraphContent = ({
  entityId,
  tableName,
  routeTableName,
  centerProperties,
}: LineageGraphTabProps) => {
  const { toast } = useToast();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [visableLayoutedNodes, setVisableLayoutedNodes] = useState<Node[]>([]);
  const [visableEdges, setVisableEdges] = useState<Edge[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [config, setConfig] = useState<LineageConfig>(readStoredLineageConfig);

  const handleConfigChange = useCallback((next: LineageConfig) => {
    setConfig(next);
    try {
      localStorage.setItem(LINEAGE_GRAPH_CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [dagName, setDagName] = useState('');
  const [saving, setSaving] = useState(false);
  const [centerOnNodeId, setCenterOnNodeId] = useState<string | null>(null);
  const { fitView, setCenter } = useReactFlow();

  const debounceRef = useRef<NodeJS.Timeout>();
  const prevNodesRef = useRef<Node[]>([]);

  const handleToggleHide = useCallback((nodeId: string) => {
    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            hidden: !node.data.hidden,
          },
        };
      }
      return node;
    }));
  }, []);

  const handleToggleSelect = useCallback((nodeId: string) => {
    setNodes(prevNodes => prevNodes.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            selected: !node.data.selected,
          },
        };
      }
      return node;
    }));
  }, []);

  const handleToggleCollapse = useCallback((nodeId: string, direction: 'upstream' | 'downstream') => {
    setNodes(prevNodes => {
      const nodeMap = new Map(prevNodes.map(n => [n.id, n]));
      const clickedNode = nodeMap.get(nodeId);
      if (!clickedNode) return prevNodes;

      const currentLoaded = clickedNode.data.loaded || { upstream: false, downstream: false };
      const isCollapsing = currentLoaded[direction]; // true -> false (collapsing), false -> true (expanding)

      if (isCollapsing) {
        // Collapsing: set collapsed[direction]=true for clicked node, cascade set visible=false for downstream nodes
        const queue = [nodeId];
        const nodeIdsToHide = new Set<string>();

        while (queue.length > 0) {
          const currentId = queue.shift()!;
          nodeIdsToHide.add(currentId);

          edges.forEach(edge => {
            if (direction === 'downstream' && edge.source === currentId && !nodeIdsToHide.has(edge.target)) {
              nodeIdsToHide.add(edge.target);
              queue.push(edge.target);
            } else if (direction === 'upstream' && edge.target === currentId && !nodeIdsToHide.has(edge.source)) {
              nodeIdsToHide.add(edge.source);
              queue.push(edge.source);
            }
          });
        }

        return prevNodes.map(node => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                collapsed: {
                  ...(node.data.collapsed || { upstream: false, downstream: false }),
                  [direction]: true,
                },
                loaded: {
                  ...(node.data.loaded || { upstream: false, downstream: false }),
                  [direction]: false,
                },
              },
            };
          } else if (nodeIdsToHide.has(node.id)) {
            return {
              ...node,
              data: {
                ...node.data,
                visible: false,
              },
            };
          }
          return node;
        });
      } else {
        // Expanding: set collapsed[direction]=false for clicked node, set visible=true for direct neighbors
        const directNeighborIds = new Set<string>();

        edges.forEach(edge => {
          if (direction === 'downstream' && edge.source === nodeId) {
            directNeighborIds.add(edge.target);
          } else if (direction === 'upstream' && edge.target === nodeId) {
            directNeighborIds.add(edge.source);
          }
        });

        return prevNodes.map(node => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                collapsed: {
                  ...(node.data.collapsed || { upstream: false, downstream: false }),
                  [direction]: false,
                },
                loaded: {
                  ...(node.data.loaded || { upstream: false, downstream: false }),
                  [direction]: true,
                },
              },
            };
          } else if (directNeighborIds.has(node.id)) {
            return {
              ...node,
              data: {
                ...node.data,
                visible: true,
              },
            };
          }
          return node;
        });
      }
    });
  }, [edges]);


  const handleSaveDag = async () => {
    if (!dagName.trim()) {
      toast('请输入DAG名称', 'error');
      return;
    }

    const selectedNodeIds = nodes.filter(n => n.data.selected).map(n => n.id);
    if (selectedNodeIds.length === 0) {
      toast('请先选择至少一个节点', 'error');
      return;
    }

    // Include center node to ensure DAG path is complete
    const allNodeIds = Array.from(new Set([entityId, ...selectedNodeIds]));

    setSaving(true);
    try {
      const response = await dagAPI.createDag({
        name: dagName,
        nodeIds: allNodeIds,
        description: `从血缘视图创建，包含 ${allNodeIds.length} 个节点`,
      });

      toast(
        <span>
          保存成功，{' '}
          <a
            href={`/dags/${response.dagView.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600 font-medium"
          >
            点击查看
          </a>
        </span>,
        'success'
      );

      setActionDialogOpen(false);
      setDagName('');
    } catch (error) {
      console.error('Error saving DAG:', error);
      toast('保存失败，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Re-layout when nodes/edges change
  useEffect(() => {
    // Check if this is initial load or visibility has changed
    const isInitialLoad = prevNodesRef.current.length === 0 && nodes.length > 0;
    const visibilityChanged = prevNodesRef.current.length !== nodes.length ||
      prevNodesRef.current.some((prevNode, index) => {
        const currentNode = nodes[index];
        return (
          prevNode.data.hidden !== currentNode.data.hidden ||
          prevNode.data.selected !== currentNode.data.selected ||
          prevNode.data.visible !== currentNode.data.visible ||
          JSON.stringify(prevNode.data.collapsed) !== JSON.stringify(currentNode.data.collapsed) ||
          JSON.stringify(prevNode.data.loaded) !== JSON.stringify(currentNode.data.loaded)
        );
      });

    if (!isInitialLoad && !visibilityChanged) {
      prevNodesRef.current = nodes;
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the layout calculation
    debounceRef.current = setTimeout(() => {
      getLayoutedElements(nodes, edges, elkOptions).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setVisableLayoutedNodes(layoutedNodes);
          setVisableEdges(layoutedEdges);

          // Fit view only on initial load
          if (isInitialLoad) {
            setInitialLoading(false);
            setTimeout(() => {
              fitView({ padding: 0.2, duration: 500 });
            }, 100);
          }

          // Center on the specified node if requested
          if (centerOnNodeId) {
            const clickedNode = layoutedNodes.find((n: Node) => n.id === centerOnNodeId);
            if (clickedNode) {
              setCenter(clickedNode.position.x, clickedNode.position.y, { zoom: 1, duration: 500 });
            }
            setCenterOnNodeId(null);
          }
        },
      );
    }, 300);

    prevNodesRef.current = nodes;
  }, [nodes, edges, centerOnNodeId, setCenter]);

  const handleLoad = useCallback(async (nodeId: string, direction: 'upstream' | 'downstream') => {
    setLoadingMore(true);
    try {
      // Fetch all dependencies (limit=1000), then apply display limit as hidden
      const lineageRes = direction === 'downstream'
        ? await lineageAPI.getDownstreamLineage(nodeId, 1, 1000)
        : await lineageAPI.getUpstreamLineage(nodeId, 1, 1000);

      const existingNodeIds = new Set(nodes.map(n => n.id));
      const existingEdgeIds = new Set(edges.map(e => e.id));

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      lineageRes.paths.forEach((path) => {
        const pathNodes = path.nodes.filter(pn => pn.id !== nodeId);
        let idx = 0;
        pathNodes.forEach(endNode => {
          const newNodeId = endNode.id;
          const ep = endNode.properties as Record<string, unknown>;
          const nodeName = lineageTableNodeLabel(ep);
          const layer = lineageTableLayer(ep);
          const description = lineageTableDescription(ep);

          if (!existingNodeIds.has(newNodeId)) {
            const parentNode = nodes.find(n => n.id === nodeId);
            const parentLevel =
              typeof parentNode?.data.level === 'number' ? parentNode.data.level : 0;
            const offsetX = direction === 'downstream' ? 300 : -300;
            const siblingIndex = idx++;
            const node: Node = {
              id: newNodeId,
              type: 'custom',
              position: {
                x: (parentNode?.position?.x ?? 0) + offsetX,
                y: (parentNode?.position?.y ?? 0) + siblingIndex * 80,
              },
              data: {
                label: nodeName,
                routeTableName: lineageEntityRouteTableName(ep),
                layer,
                description,
                entityId: newNodeId,
                isCenter: false,
                direction,
                level: parentLevel + 1,
                loaded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: { upstream: false, downstream: false },
              },
            };
            newNodes.push(node);
            existingNodeIds.add(newNodeId);
          } else {
            const existingNode = nodes.find(n => n.id === newNodeId);
            if (existingNode?.data.hidden) {
              newNodes.push({
                ...existingNode,
                data: { ...existingNode.data, hidden: false },
              });
            }
          }
        });

        path.relationships.forEach((rel) => {
          const edgeId = `${rel.startNodeId}-${rel.endNodeId}`;
          if (!existingEdgeIds.has(edgeId)) {
            newEdges.push({
              id: edgeId,
              source: rel.startNodeId,
              target: rel.endNodeId,
              type: 'smoothstep',
              animated: true,
            });
          }
        });
      });

      if (newNodes.length > 0 || newEdges.length > 0) {
        const updatedNodes = [...nodes, ...newNodes];
        const updatedEdges = [...edges, ...newEdges];

        // Find direct neighbor IDs
        const directNeighborIds = new Set<string>();
        updatedEdges.forEach(edge => {
          if (direction === 'downstream' && edge.source === nodeId) {
            directNeighborIds.add(edge.target);
          } else if (direction === 'upstream' && edge.target === nodeId) {
            directNeighborIds.add(edge.source);
          }
        });

        // Mark the clicked node as having loaded in the specified direction
        // and set visible=true for direct neighbors
        const updatedNodesWithLoaded = updatedNodes.map(node => {
          if (node.id === nodeId) {
            const currentLoaded = node.data.loaded as { upstream: boolean; downstream: boolean } | undefined;
            return {
              ...node,
              data: {
                ...node.data,
                collapsed: {
                  ...(node.data.collapsed || { upstream: false, downstream: false }),
                  [direction]: false,
                },
                loaded: {
                  ...(currentLoaded || { upstream: false, downstream: false }),
                  [direction]: true,
                },
              },
            };
          } else if (directNeighborIds.has(node.id)) {
            return {
              ...node,
              data: {
                ...node.data,
                visible: true,
              },
            };
          }
          return node;
        });

        const limitedNodes = applyPerLayerDisplayLimits(
          updatedNodesWithLoaded,
          updatedEdges,
          entityId,
          config.limit
        );
        setNodes(limitedNodes);
        setEdges(updatedEdges);
        setCenterOnNodeId(nodeId);
      }
    } catch (error) {
      console.error(`Error loading ${direction}:`, error);
    } finally {
      setLoadingMore(false);
    }
  }, [nodes, edges, config.limit, entityId]);

  const handleLoadDownstream = useCallback((nodeId: string) => handleLoad(nodeId, 'downstream'), [handleLoad]);
  const handleLoadUpstream = useCallback((nodeId: string) => handleLoad(nodeId, 'upstream'), [handleLoad]);

  const loadInitialLineage = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [upstreamRes, downstreamRes] = await Promise.all([
        lineageAPI.getUpstreamLineage(entityId, config.upstreamDepth, 1000),
        lineageAPI.getDownstreamLineage(entityId, config.downstreamDepth, 1000),
      ]);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nodeMap = new Map<string, Node>();

      const pathCenterProps =
        findCenterPropertiesInPaths(upstreamRes.paths, entityId) ??
        findCenterPropertiesInPaths(downstreamRes.paths, entityId);
      const centerDisplay = buildCenterNodeDisplay(
        entityId,
        routeTableName,
        centerProperties ?? pathCenterProps
      );

      // Add center node
      const centerNode: Node = {
        id: entityId,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          ...centerDisplay,
          isCenter: true,
          direction: 'center',
          level: 0,
          loaded: { upstream: true, downstream: true },
          hidden: false,
          selected: false,
          collapsed: { upstream: false, downstream: false },
        },
      };
      nodeMap.set(entityId, centerNode);
      newNodes.push(centerNode);

      const upstreamDepths = computeHopDepths(entityId, upstreamRes.paths, 'upstream');
      const downstreamDepths = computeHopDepths(entityId, downstreamRes.paths, 'downstream');

      // Process upstream paths — Cypher 为 (上游)-[:MAKEUP*]->(中心)，path 末端是当前表，不能只取 pathNodes[last]
      upstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        pathNodes.forEach(pathNode => {
          if (pathNode.id === entityId) return;
          const nodeId = pathNode.id;
          const up = pathNode.properties as Record<string, unknown>;
          const nodeName = lineageTableNodeLabel(up);
          const layer = lineageTableLayer(up);
          const description = lineageTableDescription(up);

          if (!nodeMap.has(nodeId)) {
            const hop = upstreamDepths.get(nodeId) ?? 1;
            const node: Node = {
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                routeTableName: lineageEntityRouteTableName(up),
                layer,
                description,
                entityId: nodeId,
                isCenter: false,
                direction: 'upstream',
                level: hop,
                loaded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: { upstream: false, downstream: false },
              },
            };
            nodeMap.set(nodeId, node);
            newNodes.push(node);
          }
        });

        path.relationships.forEach((rel) => {
          const edgeId = `${rel.startNodeId}-${rel.endNodeId}`;
          if (!newEdges.find((e) => e.id === edgeId)) {
            newEdges.push({
              id: edgeId,
              source: rel.startNodeId,
              target: rel.endNodeId,
              type: 'smoothstep',
              animated: true,
            });
          }
        });
      });

      // Process downstream paths — (中心)-[:MAKEUP*]->(下游)，含路径上所有非中心节点
      downstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        pathNodes.forEach(pathNode => {
          if (pathNode.id === entityId) return;
          const nodeId = pathNode.id;
          const dp = pathNode.properties as Record<string, unknown>;
          const nodeName = lineageTableNodeLabel(dp);
          const layer = lineageTableLayer(dp);
          const description = lineageTableDescription(dp);

          if (!nodeMap.has(nodeId)) {
            const hop = downstreamDepths.get(nodeId) ?? 1;
            const node: Node = {
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                routeTableName: lineageEntityRouteTableName(dp),
                layer,
                description,
                entityId: nodeId,
                isCenter: false,
                direction: 'downstream',
                level: hop,
                loaded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: { upstream: false, downstream: false },
              },
            };
            nodeMap.set(nodeId, node);
            newNodes.push(node);
          }
        });

        path.relationships.forEach((rel) => {
          const edgeId = `${rel.startNodeId}-${rel.endNodeId}`;
          if (!newEdges.find((e) => e.id === edgeId)) {
            newEdges.push({
              id: edgeId,
              source: rel.startNodeId,
              target: rel.endNodeId,
              type: 'smoothstep',
              animated: true,
            });
          }
        });
      });

      const nodesWithHidden = applyPerLayerDisplayLimits(newNodes, newEdges, entityId, config.limit);

      setNodes(nodesWithHidden);
      setEdges(newEdges);
    } catch (error) {
      console.error('Error loading lineage:', error);
      setInitialLoading(false);
    }
  }, [entityId, routeTableName, centerProperties, config]);

  useEffect(() => {
    loadInitialLineage();
  }, [loadInitialLineage]);

  const nodeTypes = createNodeTypes(handleToggleHide, handleToggleSelect, handleToggleCollapse, handleLoadDownstream, handleLoadUpstream);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {loadingMore && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-md flex items-center gap-2">
          <div className="size-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
          <span className="text-sm text-gray-600">加载中...</span>
        </div>
      )}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <div className="relative">
          <button
            onClick={() => setActionDialogOpen(!actionDialogOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="DAG 操作"
          >
            <MoreVerticalIcon className="size-5 text-gray-600" />
          </button>

          {actionDialogOpen && (
            <div className="absolute right-0 top-12 z-50 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">DAG 操作</h3>

              <div className="space-y-4">
                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    DAG 名称
                  </label>
                  <input
                    type="text"
                    value={dagName}
                    onChange={(e) => setDagName(e.target.value)}
                    placeholder="输入DAG视图名称"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    已选择 {nodes.filter(n => n.data.selected).length} 个节点
                  </p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setActionDialogOpen(false);
                      setDagName('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveDag}
                    disabled={saving || nodes.filter(n => n.data.selected).length === 0}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <HiddenNodesPanel
          nodes={nodes}
          onToggleHide={handleToggleHide}
        />
        <LineageConfigPanel
          config={config}
          onConfigChange={handleConfigChange}
          onApply={loadInitialLineage}
        />
      </div>
      <ReactFlow
        nodes={visableLayoutedNodes}
        edges={visableEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
