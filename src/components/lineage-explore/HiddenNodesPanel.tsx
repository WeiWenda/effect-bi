import { useState } from 'react';
import { EyeOff, Eye, Search } from 'lucide-react';
import { Node } from '@xyflow/react';

interface HiddenNodesPanelProps {
  nodes: Node[];
  onToggleHide: (nodeId: string) => void;
}

const directionLabel: Record<string, string> = {
  upstream: '上游',
  downstream: '下游',
  center: '中心',
};

export function HiddenNodesPanel({ nodes, onToggleHide }: HiddenNodesPanelProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');

  const hiddenNodes = nodes.filter(n => n.data.hidden);

  const filtered = search.trim()
    ? hiddenNodes.filter(n => {
        const label = (n.data.label as string) || '';
        return label.toLowerCase().includes(search.toLowerCase());
      })
    : hiddenNodes;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
        title="隐藏节点"
      >
        <EyeOff className="size-5 text-gray-600" />
        {hiddenNodes.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-medium rounded-full size-4 flex items-center justify-center">
            {hiddenNodes.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            隐藏节点 ({hiddenNodes.length})
          </h3>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索节点..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Node list */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">
                {search.trim() ? '未找到匹配节点' : '没有隐藏节点'}
              </p>
            )}
            {filtered.map(node => (
              <div
                key={node.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 truncate">
                    {(node.data.label as string) || node.id}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{directionLabel[(node.data.direction as string)] || node.data.direction}</span>
                    <span>·</span>
                    <span>层级 {node.data.level as number}</span>
                  </div>
                </div>
                <button
                  onClick={() => onToggleHide(node.id)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors opacity-60 group-hover:opacity-100"
                  title="显示节点"
                >
                  <Eye className="size-3.5 text-blue-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
