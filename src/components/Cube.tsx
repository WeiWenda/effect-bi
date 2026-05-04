import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Node, Edge } from '@xyflow/react';
import { DatabaseIcon, EyeIcon, HistoryIcon, ChevronLeftIcon, BarChart3Icon } from 'lucide-react';
import yaml from 'js-yaml';
import { MetadataTreePanel } from './cube-explore/MetadataTreePanel';
import { CubeCanvas, TableNodeData, JoinEdgeData, tableNodeDatabase } from './cube-explore/CubeCanvas';
import { FieldListPanel, FieldItem } from './cube-explore/FieldListPanel';
import { YamlPreviewDialog } from './cube-explore/YamlPreviewDialog';
import { VersionManageDialog } from './cube-explore/VersionManageDialog';
import { cubeAPI } from '../services/cubeApi';

const DEFAULT_BOTTOM_HEIGHT = 400;
const MIN_BOTTOM_HEIGHT = 100;
const MIN_TOP_HEIGHT = 150;

const generateDefaultCubeJson = (): string => JSON.stringify([{
  name: 'example_cube',
  title: 'Example Cube',
  description: 'Dynamic cube model example',
  sql_table: 'public.orders',
  measures: {
    count: { sql: 'id', type: 'count', description: 'Total count' },
    total_amount: { sql: 'amount', type: 'sum', description: 'Total amount' },
  },
  dimensions: {
    id: { sql: 'id', type: 'number', description: 'Order ID', primary_key: true },
    status: { sql: 'status', type: 'string', description: 'Order status' },
    created_at: { sql: 'created_at', type: 'time', description: 'Created time' },
  },
  joins: {
    customers: { sql: '{CUBE}.customer_id = {customers.id}', relationship: 'many_to_one' },
  },
}], null, 2);

interface CubeDetailPageProps {
  cubeName: string;
  onBack: () => void;
}

export function CubeDetailPage({ cubeName, onBack }: CubeDetailPageProps): React.JSX.Element {
  const navigate = useNavigate();
  const [showYamlPreview, setShowYamlPreview] = useState(false);
  const [showVersionManage, setShowVersionManage] = useState(false);
  const [nodes, setNodes] = useState<Node<TableNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [modelJson, setModelJson] = useState(generateDefaultCubeJson);
  const [modelYml, setModelYml] = useState('');
  const [modelView, setModelView] = useState('');
  const [previewTab, setPreviewTab] = useState<'model' | 'view'>('model');
  const [currentVersion, setCurrentVersion] = useState<{ id: number; remark: string; is_published: boolean } | null>(null);
  const [loadedViewport, setLoadedViewport] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const viewportRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 });
  const [bottomHeight, setBottomHeight] = useState(DEFAULT_BOTTOM_HEIGHT);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const tableNodes = useMemo(() => nodes
    .filter(n => (n.data.type === 'table' && n.data.catalog && tableNodeDatabase(n.data) && n.data.table) || (n.data.type === 'sql' && n.data.table))
    .map(n => ({
      id: n.id,
      catalog: n.data.catalog || '',
      database: tableNodeDatabase(n.data) || '',
      table: n.data.table!,
      type: n.data.type,
      sql: n.data.sql,
      sqlFields: n.data.sqlFields,
      primaryKeys: n.data.primaryKeys,
    })), [nodes]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current || !rightPanelRef.current) return;
      const panelRect = rightPanelRef.current.getBoundingClientRect();
      const mouseY = moveEvent.clientY - panelRect.top;
      const totalHeight = panelRect.height;
      const newBottomHeight = Math.max(
        MIN_BOTTOM_HEIGHT,
        Math.min(totalHeight - MIN_TOP_HEIGHT, totalHeight - mouseY)
      );
      setBottomHeight(newBottomHeight);
    };

    const handleMouseUp = () => {
      draggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleLoadVersion = useCallback((version: { canvas_data: any; field_list: any; model_json: any; model_yml: string; model_view: string; remark: string; id: number; is_published: boolean }) => {
    if (version.canvas_data?.nodes) {
      setNodes(version.canvas_data.nodes);
    }
    if (version.canvas_data?.edges) {
      setEdges(version.canvas_data.edges);
    }
    if (version.canvas_data?.viewport) {
      setLoadedViewport(version.canvas_data.viewport);
      viewportRef.current = version.canvas_data.viewport;
    }
    if (version.field_list) {
      setFields(version.field_list);
    }
    if (version.model_json) {
      setModelJson(typeof version.model_json === 'string' ? version.model_json : JSON.stringify(version.model_json, null, 2));
    }
    if (version.model_yml) {
      setModelYml(version.model_yml);
    }
    if (version.model_view) {
      setModelView(version.model_view);
    }
    setCurrentVersion({ id: version.id, remark: version.remark, is_published: version.is_published });
  }, []);

  const handlePreviewYaml = useCallback((tab: 'model' | 'view') => {
    setPreviewTab(tab);
    setShowYamlPreview(true);
  }, []);

  // Generate Cube.js Dynamic Data Model: model_json, model_yml, model_view
  const generateCubeModel = useCallback((): { modelJson: string; modelYml: string; modelView: string } => {
    if (nodes.length === 0 || fields.filter(f => f.isOutput).length === 0) {
      return { modelJson: JSON.stringify({ error: 'No tables or output fields configured yet' }, null, 2), modelYml: '', modelView: '' };
    }
    const tableNodes = nodes.filter(n => (n.data.type === 'table' && n.data.catalog && tableNodeDatabase(n.data) && n.data.table) || (n.data.type === 'sql' && n.data.table));
    if (tableNodes.length === 0) {
      return { modelJson: JSON.stringify({ error: 'No valid table nodes found' }, null, 2), modelYml: '', modelView: '' };
    }

    const outputFields = fields.filter(f => f.isOutput);
    const factNodeId = tableNodes.find(n => n.data.modelType === 'fact')?.id;
    const defaultTableId = factNodeId || (tableNodes.length > 0 ? tableNodes[0].id : '');
    const fieldsByTable = new Map<string, FieldItem[]>();
    for (const f of outputFields) {
      const tid = f.tableId || defaultTableId;
      const list = fieldsByTable.get(tid) || [];
      list.push(f); fieldsByTable.set(tid, list);
    }

    // --- Generate model_json (cube models) ---
    const cubeModels: any[] = [];
    // Build tableId -> cubeName mapping for view generation
    const tableIdToCubeName = new Map<string, string>();
    for (const tn of tableNodes) {
      const cName = tn.data.table!.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      tableIdToCubeName.set(tn.id, cName);
    }
    const factCubeNameStr = tableIdToCubeName.get(factNodeId || '') || ''

    for (const tn of tableNodes) {
      const tFields = fieldsByTable.get(tn.id);
      if (!tFields || tFields.length === 0) continue;
      const isFact = tn.data.modelType === 'fact';
      const cName = tableIdToCubeName.get(tn.id)!;
      const measures: Record<string, any> = {};
      const dimensions: Record<string, any> = {};
      for (const f of tFields) {
        const fk = f.fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const fieldCubeName = tableIdToCubeName.get(f.tableId || defaultTableId) || factCubeNameStr;
        const sqlRef = `{${fieldCubeName}}.${f.fieldName}`;
        if (f.role === 'measure') {
          const mType = inferMeasureType(f.datatype, f.expression);
          const isAggregateType = ['count', 'sum', 'avg', 'min', 'max', 'count_distinct', 'count_distinct_approx'].includes(mType);
          if (isAggregateType && f.expression) {
            measures[fk] = { type: mType, filters: [{ sql: f.expression }], ...(f.fieldDescription && { description: f.fieldDescription }) };
          } else if (!isAggregateType && f.expression) {
            measures[fk] = { sql: f.expression, type: mType, ...(f.fieldDescription && { description: f.fieldDescription }) };
          } else {
            measures[fk] = { sql: sqlRef, type: mType, ...(f.fieldDescription && { description: f.fieldDescription }) };
          }
        } else {
          dimensions[fk] = { sql: f.expression || sqlRef, type: mapDataTypeToCube(f.datatype), ...(f.isPrimaryKey && { primary_key: true }), ...(f.fieldDescription && { description: f.fieldDescription }) };
        }
      }
      // Joins: edges where this table is source
      const joins: Record<string, any> = {};
      const seen = new Set<string>();
      for (const edge of edges) {
        const ed = edge.data as JoinEdgeData | undefined;
        if (!ed?.leftField || !ed?.rightField) continue;
        const src = nodes.find(n => n.id === edge.source);
        const tgt = nodes.find(n => n.id === edge.target);
        if (!src || !tgt || src.id !== tn.id) continue;
        const tgtIsFact = tgt.id === factNodeId;
        const jName = tgtIsFact ? factCubeNameStr : (tableIdToCubeName.get(tgt.id) || tgt.data.table!.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
        if (seen.has(jName)) continue; seen.add(jName);
        const relationship = isFact && !tgtIsFact ? 'many_to_one' : !isFact && tgtIsFact ? 'one_to_many' : 'many_to_one';
        joins[jName] = { sql: `{${cName}}.${ed.leftField} = {${jName}}.${ed.rightField}`, relationship };
      }
      const isSqlNode = tn.data.type === 'sql';
      cubeModels.push({
        name: cName, title: tn.data.table,
        ...(isSqlNode
          ? { description: `Cube for SQL: ${tn.data.table}`, sql: tn.data.sql }
          : { description: `Cube for ${tableNodeDatabase(tn.data)}.${tn.data.table}`, sql_table: `${tableNodeDatabase(tn.data)}.${tn.data.table}` }
        ),
        measures, dimensions,
        ...(Object.keys(joins).length > 0 && { joins }),
      });
    }

    // --- Generate model_yml (YAML format of cube models) ---
    const toArrayWithName = (obj: Record<string, any> | undefined): any[] | undefined => {
      if (!obj || Object.keys(obj).length === 0) return undefined;
      return Object.entries(obj).map(([key, val]) => ({ name: key, ...val }));
    };
    const cubesForYaml = cubeModels.map((cube: any) => ({
      ...cube,
      measures: toArrayWithName(cube.measures),
      dimensions: toArrayWithName(cube.dimensions),
      joins: toArrayWithName(cube.joins),
    }));
    const modelYmlStr = yaml.dump({ cubes: cubesForYaml }, { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"' });

    // --- Generate model_view (Cube.js View YAML) ---
    // Build join path graph: from fact cube, trace edges to dim cubes
    const factNode = tableNodes.find(n => n.data.modelType === 'fact') || tableNodes[0];
    const joinPathMap = new Map<string, string[]>(); // cubeName -> join_path parts
    // BFS from fact cube to build join paths
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: factNode.id, path: [factCubeNameStr] }];
    visited.add(factNode.id);
    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      joinPathMap.set(nodeId, path);
      // Find edges from this node
      for (const edge of edges) {
        const ed = edge.data as JoinEdgeData | undefined;
        if (!ed?.leftField || !ed?.rightField) continue;
        const src = nodes.find(n => n.id === edge.source);
        const tgt = nodes.find(n => n.id === edge.target);
        if (!src || !tgt) continue;
        if (src.id === nodeId && !visited.has(tgt.id)) {
          const tgtCubeName = tableIdToCubeName.get(tgt.id) || tgt.data.table!.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          visited.add(tgt.id);
          queue.push({ nodeId: tgt.id, path: [...path, tgtCubeName] });
        }
        if (tgt.id === nodeId && !visited.has(src.id)) {
          const srcCubeName = tableIdToCubeName.get(src.id) || src.data.table!.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          visited.add(src.id);
          queue.push({ nodeId: src.id, path: [...path, srcCubeName] });
        }
      }
    }

    // Build view cubes list
    const viewCubes: any[] = [];
    for (const tn of tableNodes) {
      const tFields = fieldsByTable.get(tn.id);
      if (!tFields || tFields.length === 0) continue;
      const cName = tableIdToCubeName.get(tn.id)!;
      const pathParts = joinPathMap.get(tn.id);
      const joinPath = pathParts ? pathParts.join('.') : cName;
      const includes: string[] = [];
      for (const f of tFields) {
        includes.push(f.fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
      }
      const isFact = tn.data.modelType === 'fact';
      viewCubes.push({ join_path: joinPath, ...(!isFact && { prefix: true }), includes });
    }

    const viewDef = {
      views: [{
        name: cubeName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        cubes: viewCubes,
      }]
    };
    const modelViewStr = yaml.dump(viewDef, { indent: 2, lineWidth: -1, noRefs: true, quotingType: '"' });

    return {
      modelJson: JSON.stringify(cubeModels, null, 2),
      modelYml: modelYmlStr,
      modelView: modelViewStr,
    };
  }, [nodes, edges, fields, cubeName]);

  const handleGenerateYaml = useCallback(() => {
    const result = generateCubeModel();
    setModelJson(result.modelJson);
    setModelYml(result.modelYml);
    setModelView(result.modelView);
    setPreviewTab('model'); setShowYamlPreview(true);
  }, [generateCubeModel]);

  // Map database column type -> Cube.js dimension type
  function mapDataTypeToCube(dataType: string): string {
    const lower = dataType.toLowerCase();
    if (['number', 'string', 'time', 'boolean'].includes(lower)) {
      return lower;
    }
    if (lower.includes('int') || lower.includes('decimal') || lower.includes('float') || lower.includes('double') || lower.includes('numeric') || lower.includes('real')) {
      return 'number';
    }
    if (lower.includes('bool')) {
      return 'boolean';
    }
    if (lower.includes('time') || lower.includes('date') || lower.includes('timestamp')) {
      return 'time';
    }
    return 'string';
  }

  // Infer Cube.js measure type from column type and expression
  // Cube.js measure types: count, sum, avg, min, max, count_distinct, count_distinct_approx, number, string, time, boolean
  function inferMeasureType(dataType: string, expression?: string): string {
    const lower = dataType.toLowerCase();
    // If already a Cube.js measure type, return directly
    if (['count', 'sum', 'avg', 'min', 'max', 
      'count_distinct', 'count_distinct_approx', 
      'number', 'string', 'time', 'boolean'].includes(lower)) {
      return lower;
    }
    return 'number';
  }

  // Load latest version on mount
  useEffect(() => {
    const loadLatestVersion = async () => {
      try {
        const response = await cubeAPI.listVersions(cubeName);
        if (response.versions.length > 0) {
          const latestVersion = response.versions[0];
          handleLoadVersion({
            canvas_data: latestVersion.canvas_data,
            field_list: latestVersion.field_list,
            model_json: latestVersion.model_json,
            model_yml: latestVersion.model_yml,
            model_view: latestVersion.model_view,
            remark: latestVersion.remark,
            id: latestVersion.id,
            is_published: latestVersion.is_published,
          });
        }
      } catch (error) {
        console.error('Error loading latest version:', error);
      }
    };
    loadLatestVersion();
  }, [cubeName]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            title="返回列表"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <DatabaseIcon className="size-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-800">{cubeName}</h1>
          {currentVersion && (
            <span className={`text-xs px-2 py-0.5 rounded ${currentVersion.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`} title={currentVersion.is_published ? '已发布版本' : `当前内容基于版本: ${currentVersion.remark}`}>
              {currentVersion.is_published ? '已发布版本' : `基于: ${currentVersion.remark}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/query?cubeName=${encodeURIComponent(cubeName)}`)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-md text-sm font-medium hover:bg-purple-600 transition-colors"
          >
            <BarChart3Icon className="size-4" />
            可视化查询
          </button>
          <button
            onClick={() => setShowVersionManage(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            <HistoryIcon className="size-4" />
            版本管理
          </button>
          <button
            onClick={handleGenerateYaml}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <EyeIcon className="size-4" />
            Cube 模型预览
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden" ref={containerRef}>
        {/* Left Panel - Metadata Tree */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
          <MetadataTreePanel />
        </div>

        {/* Right Panel - Split vertically */}
        <div className="flex-1 flex flex-col overflow-hidden" ref={rightPanelRef}>
          {/* Top - Canvas */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CubeCanvas nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} onViewportChange={(vp) => { viewportRef.current = vp; }} initialViewport={loadedViewport} />
          </div>

          {/* Resizable Divider */}
          <div
            className="h-2 bg-gray-100 border-t border-b border-gray-200 cursor-row-resize flex items-center justify-center hover:bg-blue-100 transition-colors shrink-0"
            onMouseDown={handleMouseDown}
          >
            <div className="w-8 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Bottom - Field List */}
          <div className="shrink-0 overflow-hidden" style={{ height: bottomHeight }}>
            <FieldListPanel tableNodes={tableNodes} fields={fields} setFields={setFields} />
          </div>
        </div>
      </div>

      {/* Version Management Dialog */}
      {showVersionManage && (
        <VersionManageDialog
          open={showVersionManage}
          onClose={() => setShowVersionManage(false)}
          cubeName={cubeName}
          canvasData={{ nodes, edges, viewport: viewportRef.current }}
          fieldList={fields}
          generateModel={generateCubeModel}
          onLoadVersion={handleLoadVersion}
          onPreviewYaml={handlePreviewYaml}
        />
      )}

      {/* YAML Preview Dialog */}
      {showYamlPreview && (
        <YamlPreviewDialog
          open={showYamlPreview}
          onClose={() => { setShowYamlPreview(false); }}
          modelJson={modelJson}
          modelYml={modelYml}
          modelView={modelView}
          initialTab={previewTab}
        />
      )}
    </div>
  );
}
