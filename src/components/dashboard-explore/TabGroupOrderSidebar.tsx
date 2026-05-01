import { useCallback, useMemo, useState } from 'react';
import { GripVerticalIcon, LayersIcon, FilterIcon, FileTextIcon } from 'lucide-react';
import type { DashboardLayoutItem } from '../../types/chart';

interface TabGroupOrderSidebarProps {
  layout: DashboardLayoutItem[];
  /** 主列顺序：看板筛选器、Markdown、标签组 的 layout `i` */
  stackOrderIds: string[];
  onReorder: (nextOrder: string[]) => void;
}

function stackRowKind(item: DashboardLayoutItem | undefined): 'filter' | 'markdown' | 'tab-group' | 'other' {
  const t = item?.widgetType;
  if (t === 'filter') return 'filter';
  if (t === 'markdown') return 'markdown';
  if (t === 'tab-group') return 'tab-group';
  return 'other';
}

export function TabGroupOrderSidebar({
  layout,
  stackOrderIds,
  onReorder,
}: TabGroupOrderSidebarProps): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null);

  const labelFor = useCallback(
    (id: string) => {
      const item = layout.find(l => l.i === id);
      const kind = stackRowKind(item);
      if (kind === 'filter') return '看板筛选器';
      if (kind === 'markdown') return 'Markdown';
      if (kind === 'tab-group') {
        const named = item?.tabGroupTitle?.trim();
        if (named) return named;
        const firstTab = item?.tabGroupTabs?.[0];
        if (item?.isDefaultTabGroup || id === 'default-tab-group') return '默认标签组';
        return firstTab?.label ? `标签组 · ${firstTab.label}` : `标签组 · ${id.slice(0, 8)}`;
      }
      return id.slice(0, 12);
    },
    [layout]
  );

  const rowMeta = useMemo(() => {
    const map = new Map<string, { kind: ReturnType<typeof stackRowKind>; label: string }>();
    for (const id of stackOrderIds) {
      const item = layout.find(l => l.i === id);
      map.set(id, { kind: stackRowKind(item), label: labelFor(id) });
    }
    return map;
  }, [layout, stackOrderIds, labelFor]);

  const onDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    if (!fromId || fromId === targetId) return;
    const fromIdx = stackOrderIds.indexOf(fromId);
    const toIdx = stackOrderIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...stackOrderIds];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromId);
    onReorder(next);
  };

  const onDragEnd = () => setDragId(null);

  const KindIcon = ({ id }: { id: string }) => {
    const kind = rowMeta.get(id)?.kind ?? 'other';
    if (kind === 'filter') {
      return <FilterIcon className="size-3.5 shrink-0 text-blue-600" aria-hidden />;
    }
    if (kind === 'markdown') {
      return <FileTextIcon className="size-3.5 shrink-0 text-green-600" aria-hidden />;
    }
    if (kind === 'tab-group') {
      return <LayersIcon className="size-3.5 shrink-0 text-purple-600" aria-hidden />;
    }
    return <span className="size-3.5 shrink-0 rounded bg-gray-200" aria-hidden />;
  };

  if (stackOrderIds.length === 0) {
    return (
      <div className="w-56 shrink-0 border-l border-gray-200 bg-white p-3 text-xs text-gray-500">
        暂无主列区块
      </div>
    );
  }

  return (
    <div className="w-56 shrink-0 border-l border-gray-200 bg-white flex flex-col">
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/80">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <LayersIcon className="size-3.5 text-gray-500" />
          主列顺序
        </div>
        <p className="text-[10px] text-gray-500 mt-1 leading-snug">
          拖拽调整筛选器、Markdown 与标签组的上下顺序（通栏）
        </p>
      </div>
      <ul className="flex-1 overflow-auto p-2 space-y-1.5">
        {stackOrderIds.map(id => {
          const meta = rowMeta.get(id);
          const kind = meta?.kind ?? 'other';
          const borderActive =
            kind === 'filter'
              ? 'border-blue-300 bg-blue-50/80'
              : kind === 'markdown'
                ? 'border-green-300 bg-green-50/60'
                : kind === 'tab-group'
                  ? 'border-purple-300 bg-purple-50/60'
                  : 'border-gray-200 bg-gray-50/80';
          const borderIdle =
            kind === 'filter'
              ? 'border-gray-200 hover:border-blue-200'
              : kind === 'markdown'
                ? 'border-gray-200 hover:border-green-200'
                : kind === 'tab-group'
                  ? 'border-gray-200 hover:border-purple-200'
                  : 'border-gray-200';

          return (
            <li
              key={id}
              draggable
              onDragStart={e => onDragStart(e, id)}
              onDragOver={onDragOver}
              onDrop={e => onDrop(e, id)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-2 rounded-md border px-2 py-2 text-xs cursor-grab active:cursor-grabbing select-none transition-colors ${
                dragId === id ? borderActive : borderIdle
              }`}
            >
              <GripVerticalIcon className="size-3.5 text-gray-400 shrink-0" />
              <span className="shrink-0" title={kind === 'filter' ? '看板筛选器' : kind === 'markdown' ? 'Markdown' : kind === 'tab-group' ? '标签组' : '其他'}>
                <KindIcon id={id} />
              </span>
              <span className="truncate text-gray-800">{meta?.label ?? id}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
