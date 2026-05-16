import { Navigate, useLocation } from 'react-router-dom';
import { isPathBlockedInMetaOnlyMode } from '../config/appMode';

interface MetaOnlyRouteGuardProps {
  children: React.ReactNode;
}

/** 元数据-only 模式下拦截 ETL / Cube / 查询 / 看板路由 */
export function MetaOnlyRouteGuard({ children }: MetaOnlyRouteGuardProps): React.JSX.Element {
  const { pathname } = useLocation();
  if (isPathBlockedInMetaOnlyMode(pathname)) {
    return <Navigate to="/lineage" replace />;
  }
  return <>{children}</>;
}
