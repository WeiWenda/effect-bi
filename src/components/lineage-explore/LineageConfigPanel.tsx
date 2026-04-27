import { useState } from 'react';
import { Settings } from 'lucide-react';

export interface LineageConfig {
  upstreamDepth: number;
  downstreamDepth: number;
  limit: number;
}

interface LineageConfigPanelProps {
  config: LineageConfig;
  onConfigChange: (config: LineageConfig) => void;
  onApply: () => void;
}

export function LineageConfigPanel({ config, onConfigChange, onApply }: LineageConfigPanelProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        title="查询配置"
      >
        <Settings className="size-5 text-gray-600" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-80 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">查询配置</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                上游层数
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={config.upstreamDepth}
                onChange={(e) => {
                  const value = Math.min(5, Math.max(1, parseInt(e.target.value) || 1));
                  onConfigChange({ ...config, upstreamDepth: value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                下游层数
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={config.downstreamDepth}
                onChange={(e) => {
                  const value = Math.min(5, Math.max(1, parseInt(e.target.value) || 1));
                  onConfigChange({ ...config, downstreamDepth: value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                默认展开数量
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={config.limit}
                onChange={(e) => {
                  const value = Math.min(500, Math.max(1, parseInt(e.target.value) || 1));
                  onConfigChange({ ...config, limit: value });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  onApply();
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                应用配置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
