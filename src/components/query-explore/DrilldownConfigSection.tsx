import { useState } from 'react';
import { SettingsIcon, XIcon, ChevronDownIcon } from 'lucide-react';
import type { DynamicDrilldownConfig, DimensionConfig, CubeMember } from '../../types/chart';

interface DrilldownConfigSectionProps {
  drilldownConfig: DynamicDrilldownConfig | undefined;
  onDrilldownConfigChange: (config: DynamicDrilldownConfig | undefined) => void;
  onDrilldownChange: (dimensions: string[]) => void;
  selectedDrilldownDimensions: string[];
  availableDimensions: CubeMember[];
}

export function DrilldownConfigSection({
  drilldownConfig,
  onDrilldownConfigChange,
  onDrilldownChange,
  selectedDrilldownDimensions,
  availableDimensions,
}: DrilldownConfigSectionProps): React.JSX.Element {
  const [showSettings, setShowSettings] = useState(false);

  const enabled = drilldownConfig?.enabled ?? false;
  const dimensions = drilldownConfig?.dimensions ?? [];
  const selectionMode = drilldownConfig?.selectionMode ?? 'multiple';
  const allowEmptySelection = drilldownConfig?.allowEmptySelection ?? true;

  const handleToggle = () => {
    if (enabled) {
      onDrilldownConfigChange(undefined);
      onDrilldownChange([]);
    } else {
      onDrilldownConfigChange({
        enabled: true,
        dimensions: [],
        selectionMode: 'multiple',
        allowEmptySelection: true,
        defaultSelected: [],
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!enabled) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.memberType !== 'dimension') return;
      if (dimensions.some(d => d.field === data.name)) return;
      const newDim: DimensionConfig = {
        field: data.name,
        title: data.title || data.name,
        type: data.type,
      };
      onDrilldownConfigChange({
        ...drilldownConfig!,
        dimensions: [...dimensions, newDim],
      });
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleRemoveDimension = (field: string) => {
    onDrilldownConfigChange({
      ...drilldownConfig!,
      dimensions: dimensions.filter(d => d.field !== field),
    });
    onDrilldownChange(selectedDrilldownDimensions.filter(d => d !== field));
  };

  const handleSelectionModeChange = (mode: 'single' | 'multiple') => {
    onDrilldownConfigChange({
      ...drilldownConfig!,
      selectionMode: mode,
      defaultSelected: mode === 'single' && selectedDrilldownDimensions.length > 1
        ? [selectedDrilldownDimensions[0]]
        : selectedDrilldownDimensions,
    });
    if (mode === 'single' && selectedDrilldownDimensions.length > 1) {
      onDrilldownChange([selectedDrilldownDimensions[0]]);
    }
  };

  const handleAllowEmptyChange = (allow: boolean) => {
    onDrilldownConfigChange({
      ...drilldownConfig!,
      allowEmptySelection: allow,
    });
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`min-h-[60px] rounded-lg border-2 border-dashed p-2 transition-colors ${
        !enabled ? 'border-gray-200 bg-gray-50' : dimensions.length === 0 ? 'border-purple-200 bg-purple-50/50' : 'border-purple-200 bg-purple-50/50'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-gray-400">动态维度下钻</div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={handleToggle}
              className="size-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-xs text-gray-500">开启</span>
          </label>
          {enabled && (
            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <SettingsIcon className="size-3" />
                <ChevronDownIcon className={`size-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>
              {showSettings && (
                <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-44 space-y-2.5">
                  <div>
                    <div className="text-xs text-gray-500 mb-1.5">选择模式</div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="radio"
                          name="selectionMode"
                          checked={selectionMode === 'single'}
                          onChange={() => handleSelectionModeChange('single')}
                          className="size-3"
                        />
                        单选
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="radio"
                          name="selectionMode"
                          checked={selectionMode === 'multiple'}
                          onChange={() => handleSelectionModeChange('multiple')}
                          className="size-3"
                        />
                        多选
                      </label>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowEmptySelection}
                      onChange={e => handleAllowEmptyChange(e.target.checked)}
                      className="size-3 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-600">允许空选择</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!enabled ? (
        <div className="text-xs text-gray-300 text-center py-2">勾选开启后拖入维度字段</div>
      ) : dimensions.length === 0 ? (
        <div className="text-xs text-purple-300 text-center py-2">拖入维度字段</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {dimensions.map(dim => (
            <div key={dim.field} className="flex items-center gap-1 bg-white border border-purple-200 rounded-md px-2 py-1 text-xs shadow-sm">
              <span className="text-purple-700">{dim.title || dim.field}</span>
              <button
                onClick={() => handleRemoveDimension(dim.field)}
                className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
