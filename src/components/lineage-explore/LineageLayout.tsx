import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useMatch } from 'react-router-dom';
import { Neo4jTableTreePanel } from './Neo4jTableTreePanel';

const SIDEBAR_WIDTH_KEY = 'lineage-table-tree-panel-width';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 560;

function readStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const n = raw != null ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) {
      return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, n));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

/**
 * /lineage 布局：左侧 Neo4j 表树常驻，右侧为首页搜索或表详情（Outlet）。
 */
export function LineageLayout(): React.JSX.Element {
  const match = useMatch({ path: '/lineage/table/:tableName', end: true });
  const selectedRouteTableName = match?.params.tableName ?? null;

  const [sidebarWidth, setSidebarWidth] = useState(readStoredSidebarWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);

  const persistWidth = useCallback((width: number) => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = moveEvent.clientX - startXRef.current;
        const next = Math.min(
          MAX_SIDEBAR_WIDTH,
          Math.max(MIN_SIDEBAR_WIDTH, startWidthRef.current + delta)
        );
        setSidebarWidth(next);
      };

      const handleMouseUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setSidebarWidth(current => {
          persistWidth(current);
          return current;
        });
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth, persistWidth]
  );

  useEffect(() => {
    return () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 bg-gray-50">
      <aside
        className="flex min-h-0 shrink-0 flex-col bg-white"
        style={{ width: sidebarWidth }}
      >
        <Neo4jTableTreePanel selectedRouteTableName={selectedRouteTableName} />
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整表目录宽度"
        title="拖动调整宽度"
        onMouseDown={handleResizeStart}
        className="group relative z-10 w-1 shrink-0 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-400 active:bg-blue-500"
      >
        <div className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
}
