import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
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
import { ChevronLeft, ChevronRight, Plus, Minus, ExternalLink, Eye, EyeOff, Check } from 'lucide-react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { lineageAPI, LineageNode, LineageRelationship } from '../../services/lineageApi';
import { LineageConfigPanel, LineageConfig } from './LineageConfigPanel';

interface LineageGraphTabProps {
  entityId: string;
  tableName: string;
}

interface NodeData {
  label: string;
  layer?: string;
  description?: string;
  entityId: string;
  isCenter: boolean;
  direction: 'upstream' | 'downstream' | 'center';
  level: number;
  expanded: {
    upstream: boolean;
    downstream: boolean;
  };
  hidden?: boolean;
  selected?: boolean;
  collapsed?: boolean;
}

const CustomNode = ({ data, onToggleHide, onToggleSelect, onToggleCollapse, onExpandDownstream, onExpandUpstream, showOnlySelected }: { data: NodeData; onToggleHide?: (nodeId: string) => void; onToggleSelect?: (nodeId: string) => void; onToggleCollapse?: (nodeId: string, direction: 'upstream' | 'downstream') => void; onExpandDownstream?: (nodeId: string) => void; onExpandUpstream?: (nodeId: string) => void; showOnlySelected?: boolean }) => {
  const handleOpenNewPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: Open new page with current node as center
    window.open(`/lineage/table/${data.label}`, '_blank');
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
    // Check if upstream nodes are expanded
    if (data.expanded?.upstream) {
      // If expanded, collapse them
      onToggleCollapse?.(data.entityId, 'upstream');
    } else {
      // If not expanded, fetch from backend
      onExpandUpstream?.(data.entityId);
    }
  };

  const handleRightButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Check if downstream nodes are expanded
    if (data.expanded?.downstream) {
      // If expanded, collapse them
      onToggleCollapse?.(data.entityId, 'downstream');
    } else {
      // If not expanded, fetch from backend
      onExpandDownstream?.(data.entityId);
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
            title={data.expanded?.upstream ? "收起上游" : "查看上游"}
          >
            <ChevronLeft className="size-3 text-gray-500" />
          </button>
        )}
        {showRightButton && (
          <button
            onClick={handleRightButtonClick}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title={data.expanded?.downstream ? "收起下游" : "查看下游"}
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
        {!data.isCenter && !showOnlySelected && (
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

export function LineageGraphTab({ entityId, tableName }: LineageGraphTabProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <LineageGraphContent entityId={entityId} tableName={tableName} />
    </ReactFlowProvider>
  );
}

const createNodeTypes = (onToggleHide?: (nodeId: string) => void, onToggleSelect?: (nodeId: string) => void, onToggleCollapse?: (nodeId: string, direction: 'upstream' | 'downstream') => void, onExpandDownstream?: (nodeId: string) => void, onExpandUpstream?: (nodeId: string) => void, showOnlySelected?: boolean): NodeTypes => ({
  custom: (props) => <CustomNode {...props} onToggleHide={onToggleHide} onToggleSelect={onToggleSelect} onToggleCollapse={onToggleCollapse} onExpandDownstream={onExpandDownstream} onExpandUpstream={onExpandUpstream} showOnlySelected={showOnlySelected} />,
});

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '130',
  'elk.spacing.nodeNode': '80',
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], showOnlySelected: boolean, options = {}): Promise<{ nodes: Node[]; edges: Edge[] }> => {
  let visibleNodes = nodes.filter(n => !n.data.hidden);

  if (showOnlySelected) {
    visibleNodes = visibleNodes.filter(n => n.data.selected || n.data.isCenter);
  }

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

const LineageGraphContent = ({ entityId, tableName }: LineageGraphTabProps) => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<LineageConfig>({
    upstreamDepth: 1,
    downstreamDepth: 1,
    limit: 10,
  });
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const { fitView, setCenter } = useReactFlow();

  const debounceRef = useRef<NodeJS.Timeout>();
  const prevNodesRef = useRef<Node[]>([]);
  const prevShowOnlySelectedRef = useRef<boolean>(showOnlySelected);

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
      const queue = [nodeId];
      const nodeIdsToUpdate = new Set<string>();

      // Find all nodes in the specified direction
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        nodeIdsToUpdate.add(currentId);

        edges.forEach(edge => {
          if (direction === 'downstream' && edge.source === currentId && !nodeIdsToUpdate.has(edge.target)) {
            nodeIdsToUpdate.add(edge.target);
            queue.push(edge.target);
          } else if (direction === 'upstream' && edge.target === currentId && !nodeIdsToUpdate.has(edge.source)) {
            nodeIdsToUpdate.add(edge.source);
            queue.push(edge.source);
          }
        });
      }

      // Toggle expanded state for all nodes in the direction
      return prevNodes.map(node => {
        if (nodeIdsToUpdate.has(node.id)) {
          const currentExpanded = node.data.expanded || { upstream: false, downstream: false };
          return {
            ...node,
            data: {
              ...node.data,
              expanded: {
                ...currentExpanded,
                [direction]: !currentExpanded[direction],
              },
            },
          };
        }
        return node;
      });
    });
  }, [edges]);

  const handleToggleShowOnlySelected = useCallback(() => {
    setShowOnlySelected(prev => !prev);
  }, []);

  // Re-layout when hidden, collapsed, or showOnlySelected changes
  useEffect(() => {
    if (nodes.length === 0) return;

    // Check if visibility has changed
    const visibilityChanged = prevNodesRef.current.length !== nodes.length ||
      prevNodesRef.current.some((prevNode, index) => {
        const currentNode = nodes[index];
        return (
          prevNode.data.hidden !== currentNode.data.hidden ||
          prevNode.data.selected !== currentNode.data.selected ||
          JSON.stringify(prevNode.data.expanded) !== JSON.stringify(currentNode.data.expanded)
        );
      });

    if (!visibilityChanged && showOnlySelected === prevShowOnlySelectedRef.current) {
      prevNodesRef.current = nodes;
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the layout calculation
    debounceRef.current = setTimeout(() => {
      getLayoutedElements(nodes, edges, showOnlySelected, elkOptions).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        },
      );
    }, 300);

    prevNodesRef.current = nodes;
    prevShowOnlySelectedRef.current = showOnlySelected;
  }, [showOnlySelected, nodes, edges]);

  const handleExpandDownstream = useCallback(async (nodeId: string) => {
    setLoading(true);
    try {
      const downstreamRes = await lineageAPI.getDownstreamLineage(nodeId, 1, config.limit);

      const existingNodeIds = new Set(nodes.map(n => n.id));
      const existingEdgeIds = new Set(edges.map(e => e.id));

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      downstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        if (pathNodes.length > 0) {
          const downstreamNode = pathNodes[pathNodes.length - 1];
          const nodeId = downstreamNode.id;
          const nodeName = downstreamNode.properties.table_name || downstreamNode.properties.name || 'Unknown';
          const layer = downstreamNode.properties.layer || downstreamNode.properties.tier;
          const description = downstreamNode.properties.description || downstreamNode.properties.comment || '';

          if (!existingNodeIds.has(nodeId)) {
            const node: Node = {
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                layer,
                description,
                entityId: nodeId,
                isCenter: false,
                direction: 'downstream',
                level: 2,
                expanded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: false,
              },
            };
            newNodes.push(node);
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

        // Mark the clicked node as having expanded downstream
        const updatedNodesWithLoaded = updatedNodes.map(node => {
          if (node.id === nodeId) {
            const currentExpanded = node.data.expanded as { upstream: boolean; downstream: boolean } | undefined;
            return {
              ...node,
              data: {
                ...node.data,
                expanded: {
                  ...(currentExpanded || { upstream: false, downstream: false }),
                  downstream: true,
                },
              },
            };
          }
          return node;
        });

        getLayoutedElements(updatedNodesWithLoaded, updatedEdges, showOnlySelected, elkOptions).then(
          ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);

            // Find the clicked node in the layouted nodes and center on it
            const clickedNode = layoutedNodes.find((n: Node) => n.id === nodeId);
            if (clickedNode) {
              setCenter(clickedNode.position.x, clickedNode.position.y, { zoom: 1, duration: 500 });
            }
          },
        );
      }
    } catch (error) {
      console.error('Error expanding downstream:', error);
    } finally {
      setLoading(false);
    }
  }, [nodes, edges, config.limit, setCenter, showOnlySelected]);

  const handleExpandUpstream = useCallback(async (nodeId: string) => {
    setLoading(true);
    try {
      const upstreamRes = await lineageAPI.getUpstreamLineage(nodeId, 1, config.limit);

      const existingNodeIds = new Set(nodes.map(n => n.id));
      const existingEdgeIds = new Set(edges.map(e => e.id));

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      upstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        if (pathNodes.length > 0) {
          const upstreamNode = pathNodes[pathNodes.length - 1];
          const nodeId = upstreamNode.id;
          const nodeName = upstreamNode.properties.table_name || upstreamNode.properties.name || 'Unknown';
          const layer = upstreamNode.properties.layer || upstreamNode.properties.tier;
          const description = upstreamNode.properties.description || upstreamNode.properties.comment || '';

          if (!existingNodeIds.has(nodeId)) {
            const node: Node = {
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                layer,
                description,
                entityId: nodeId,
                isCenter: false,
                direction: 'upstream',
                level: 2,
                expanded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: false,
              },
            };
            newNodes.push(node);
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

        // Mark the clicked node as having expanded upstream
        const updatedNodesWithLoaded = updatedNodes.map(node => {
          if (node.id === nodeId) {
            const currentExpanded = node.data.expanded as { upstream: boolean; downstream: boolean } | undefined;
            return {
              ...node,
              data: {
                ...node.data,
                expanded: {
                  ...(currentExpanded || { upstream: false, downstream: false }),
                  upstream: true,
                },
              },
            };
          }
          return node;
        });

        getLayoutedElements(updatedNodesWithLoaded, updatedEdges, showOnlySelected, elkOptions).then(
          ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);

            const clickedNode = layoutedNodes.find((n: Node) => n.id === nodeId);
            if (clickedNode) {
              setCenter(clickedNode.position.x, clickedNode.position.y, { zoom: 1, duration: 500 });
            }
          },
        );
      }
    } catch (error) {
      console.error('Error expanding upstream:', error);
    } finally {
      setLoading(false);
    }
  }, [nodes, edges, config.limit, setCenter, showOnlySelected]);

  const loadInitialLineage = useCallback(async () => {
    setLoading(true);
    try {
      const [upstreamRes, downstreamRes] = await Promise.all([
        lineageAPI.getUpstreamLineage(entityId, config.upstreamDepth, config.limit),
        lineageAPI.getDownstreamLineage(entityId, config.downstreamDepth, config.limit),
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
          entityId,
          isCenter: true,
          direction: 'center',
          level: 0,
          expanded: { upstream: true, downstream: true },
          hidden: false,
          selected: false,
          collapsed: false,
        },
      };
      nodeMap.set(entityId, centerNode);
      newNodes.push(centerNode);

      // Process upstream paths
      upstreamRes.paths.forEach((path) => {
        const pathNodes = path.nodes;
        if (pathNodes.length > 0) {
          const upstreamNode = pathNodes[pathNodes.length - 1]; // Get the last node (actual upstream node)
          const nodeId = upstreamNode.id;
          const nodeName = upstreamNode.properties.table_name || upstreamNode.properties.name || 'Unknown';
          const layer = upstreamNode.properties.layer || upstreamNode.properties.tier;
          const description = upstreamNode.properties.description || upstreamNode.properties.comment || '';

          if (!nodeMap.has(nodeId)) {
            const node: Node = {
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                layer,
                description,
                entityId: nodeId,
                isCenter: false,
                direction: 'upstream',
                level: 1,
                expanded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: false,
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
          const nodeName = downstreamNode.properties.table_name || downstreamNode.properties.name || 'Unknown';
          const layer = downstreamNode.properties.layer || downstreamNode.properties.tier;
          const description = downstreamNode.properties.description || downstreamNode.properties.comment || '';

          if (!nodeMap.has(nodeId)) {
            const node: Node = {
              id: nodeId,
              type: 'custom',
              position: { x: 0, y: 0 },
              data: {
                label: nodeName,
                layer,
                description,
                entityId: nodeId,
                isCenter: false,
                direction: 'downstream',
                level: 1,
                expanded: { upstream: false, downstream: false },
                hidden: false,
                selected: false,
                collapsed: false,
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

      // Apply ELK layout
      getLayoutedElements(newNodes, newEdges, showOnlySelected, elkOptions).then(
        ({ nodes: layoutedNodes, edges: layoutedEdges }) => {
          setNodes(layoutedNodes);
          setEdges(layoutedEdges);
        },
      );
    } catch (error) {
      console.error('Error loading lineage:', error);
    } finally {
      setLoading(false);
    }
  }, [entityId, tableName, config]);

  useEffect(() => {
    loadInitialLineage();
  }, [loadInitialLineage]);

  const nodeTypes = createNodeTypes(handleToggleHide, handleToggleSelect, handleToggleCollapse, handleExpandDownstream, handleExpandUpstream, showOnlySelected);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={handleToggleShowOnlySelected}
          className="px-3 py-1.5 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 transition-colors text-sm"
          disabled={nodes.filter(n => n.data.selected).length === 0}
        >
          {showOnlySelected ? "显示全部" : "只看选中"}
        </button>
        <LineageConfigPanel
          config={config}
          onConfigChange={setConfig}
          onApply={loadInitialLineage}
        />
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
