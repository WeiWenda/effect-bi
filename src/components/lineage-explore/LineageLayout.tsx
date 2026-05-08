import { Outlet, useMatch } from 'react-router-dom';
import { Neo4jTableTreePanel } from './Neo4jTableTreePanel';

/**
 * /lineage 布局：左侧 Neo4j 表树常驻，右侧为首页搜索或表详情（Outlet）。
 */
export function LineageLayout(): React.JSX.Element {
  const match = useMatch({ path: '/lineage/table/:tableName', end: true });
  const selectedRouteTableName = match?.params.tableName ?? null;

  return (
    <div className="flex h-full min-h-0 bg-gray-50">
      <div className="flex min-h-0 w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
        <Neo4jTableTreePanel selectedRouteTableName={selectedRouteTableName} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
}
