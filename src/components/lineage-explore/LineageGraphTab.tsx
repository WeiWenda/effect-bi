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
import { lineageAPI, LineageNode, LineageRelationship } from '../../services/lineageApi';
import {
  lineageEntityRouteTableName,
  lineageTableDescription,
  lineageTableDisplayName,
  lineageTableLayer,
} from '../../services/lineageNodeMeta';
import { dagAPI } from '../../services/dagApi';
import { LineageConfigPanel, LineageConfig } from './LineageConfigPanel';
import { HiddenNodesPanel } from './HiddenNodesPanel';
import { useToast } from '../ui/toast';

interface LineageGraphTabProps {
  entityId: string;
  tableName: string;
  /** 用于详情页 URL、与 /lineage/entity?tableName= 一致 */
  routeTableName: string;
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
    <div className={`px-4 py-3 border-2 rounded-lg shadow-sm min-w-[180px] ${nodeClass}`}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
      <div className="text-sm font-medium text-gray-800 mb-1">{data.label}</div>
      {data.description && (
        <div className="text-xs text-gray-600 mb-1 line-clamp-2" title={data.description}>
          {data.description}
        </div>
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

export function LineageGraphTab({ entityId, tableName, routeTableName }: LineageGraphTabProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <LineageGraphContent entityId={entityId} tableName={tableName} routeTableName={routeTableName} />
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
      width: 220,
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

const LineageGraphContent = ({ entityId, tableName, routeTableName }: LineageGraphTabProps) => {
  const { toast } = useToast();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [visableLayoutedNodes, setVisableLayoutedNodes] = useState<Node[]>([]);
  const [visableEdges, setVisableEdges] = useState<Edge[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [config, setConfig] = useState<LineageConfig>({
    upstreamDepth: 1,
    downstreamDepth: 1,
    limit: 5,
  });
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
        const pathNodes = path.nodes;
        if (pathNodes.length > 0) {
          const endNode = pathNodes[pathNodes.length - 1];
          const newNodeId = endNode.id;
          const ep = endNode.properties as Record<string, unknown>;
          const nodeName = lineageTableDisplayName(ep);
          const layer = lineageTableLayer(ep);
          const description = lineageTableDescription(ep);

          if (!existingNodeIds.has(newNodeId)) {
            // Position new nodes near their parent to avoid flash at (0,0)
            const parentNode = nodes.find(n => n.id === nodeId);
            const offsetX = direction === 'downstream' ? 300 : -300;
            const existingCount = newNodes.length;
            const node: Node = {
              id: newNodeId,
              type: 'custom',
              position: { 
                x: (parentNode?.position?.x ?? 0) + offsetX, 
                y: (parentNode?.position?.y ?? 0) + existingCount * 80 
              },
              data: {
                label: nodeName,
                routeTableName: lineageEntityRouteTableName(ep),
                layer,
                description,
                entityId: newNodeId,
                isCenter: false,
                direction,
                level: 2,
                loaded: { upstream: false, downstream: false },
                hidden: existingCount >= config.limit,
                selected: false,
                collapsed: { upstream: false, downstream: false },
              },
            };
            newNodes.push(node);
          } else {
            // Node already exists but may be hidden — unhide it
            const existingNode = nodes.find(n => n.id === newNodeId);
            if (existingNode?.data.hidden) {
              newNodes.push({
                ...existingNode,
                data: { ...existingNode.data, hidden: false },
              });
            }
          }

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
        }
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

        setNodes(updatedNodesWithLoaded);
        setEdges(updatedEdges);
        setCenterOnNodeId(nodeId);
      }
    } catch (error) {
      console.error(`Error loading ${direction}:`, error);
    } finally {
      setLoadingMore(false);
    }
  }, [nodes, edges, config.limit]);

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

      // Add center node
      const centerNode: Node = {
        id: entityId,
        type: 'custom',
        position: { x: 0, y: 0 },
        data: {
          label: tableName,
          routeTableName,
          entityId,
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

      // Track order of first appearance per direction for applying display limit
      const upstreamOrder: string[] = [];
      const downstreamOrder: string[] = [];

      // Process upstream paths
      upstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        if (pathNodes.length > 0) {
          const upstreamNode = pathNodes[pathNodes.length - 1]; // Get the last node (actual upstream node)
          const nodeId = upstreamNode.id;
          const up = upstreamNode.properties as Record<string, unknown>;
          const nodeName = lineageTableDisplayName(up);
          const layer = lineageTableLayer(up);
          const description = lineageTableDescription(up);

          if (!nodeMap.has(nodeId)) {
            upstreamOrder.push(nodeId);
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
                level: 1,
                loaded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: { upstream: false, downstream: false },
              },
            };
            nodeMap.set(nodeId, node);
            newNodes.push(node);
          }

          // Add edge
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
        }
      });

      // Process downstream paths
      downstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        if (pathNodes.length > 0) {
          const downstreamNode = pathNodes[pathNodes.length - 1];
          const nodeId = downstreamNode.id;
          const dp = downstreamNode.properties as Record<string, unknown>;
          const nodeName = lineageTableDisplayName(dp);
          const layer = lineageTableLayer(dp);
          const description = lineageTableDescription(dp);

          if (!nodeMap.has(nodeId)) {
            downstreamOrder.push(nodeId);
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
                level: 1,
                loaded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: { upstream: false, downstream: false },
              },
            };
            nodeMap.set(nodeId, node);
            newNodes.push(node);
          }

          // Add edge
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
        }
      });

      // Apply display limit: mark nodes beyond config.limit as hidden per direction
      const hiddenUpstreamIds = new Set(upstreamOrder.slice(config.limit));
      const hiddenDownstreamIds = new Set(downstreamOrder.slice(config.limit));
      const hiddenIds = new Set([...hiddenUpstreamIds, ...hiddenDownstreamIds]);

      const nodesWithHidden = newNodes.map(node => {
        if (hiddenIds.has(node.id)) {
          return { ...node, data: { ...node.data, hidden: true } };
        }
        return node;
      });

      // Set nodes and edges, let useEffect handle layout
      setNodes(nodesWithHidden);
      setEdges(newEdges);
    } catch (error) {
      console.error('Error loading lineage:', error);
      setInitialLoading(false);
    }
  }, [entityId, tableName, routeTableName, config]);

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
          onConfigChange={setConfig}
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
