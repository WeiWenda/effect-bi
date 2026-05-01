import { useState, useCallback } from 'react';
import { XIcon, ChevronDownIcon, SettingsIcon, SlidersHorizontalIcon, LayersIcon } from 'lucide-react';
import { TimeRangeFilter } from './TimeRangeFilter';
import type { DynamicFilterConfig, DynamicDrilldownConfig, DimensionConfig, CubeMember, FilterOperator } from '../../types/chart';

function isTimeType(type: string): boolean {
  const lower = type.toLowerCase();
  return lower.includes('time') || lower.includes('date') || lower.includes('timestamp');
}

function isRangeOperator(op: FilterOperator): boolean {
  return op === 'inDateRange' || op === 'notInDateRange';
}

const ALL_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: '等于' },
  { value: 'notEquals', label: '不等于' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'in', label: '在列表中' },
  { value: 'notIn', label: '不在列表中' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'inDateRange', label: '在范围内' },
  { value: 'notInDateRange', label: '不在范围内' },
  { value: 'set', label: '有值' },
  { value: 'notSet', label: '无值' },
];

function getOperatorLabel(op: FilterOperator): string {
  return ALL_OPERATORS.find(o => o.value === op)?.label || op;
}

// 拖拽数据类型
export const DRILLDOWN_DRAG_TYPE = 'application/x-drilldown-dimension';

interface ChartDynamicControlsProps {
  // 动态过滤器配置
  dynamicFilters: DynamicFilterConfig[];
  // 动态过滤器当前值
  dynamicFilterValues: Record<string, string[]>;
  onDynamicFilterChange: (field: string, values: string[]) => void;
  onRemoveDynamicFilter?: (field: string) => void;

  // 动态维度下钻配置
  drilldownConfig?: DynamicDrilldownConfig;
  // 当前选中的下钻维度
  selectedDrilldownDimensions: string[];
  onDrilldownChange: (dimensions: string[]) => void;
  onDrilldownConfigChange?: (config: DynamicDrilldownConfig | undefined) => void;

  // 可用字段（用于显示标题等）
  availableFields: CubeMember[];
  // 可拖拽到下钻区的维度字段
  availableDimensions: CubeMember[];

  // 是否在编辑模式
  isEditMode?: boolean;
}

export function ChartDynamicControls({
  dynamicFilters,
  dynamicFilterValues,
  onDynamicFilterChange,
  onRemoveDynamicFilter,
  drilldownConfig,
  selectedDrilldownDimensions,
  onDrilldownChange,
  onDrilldownConfigChange,
  availableFields,
  availableDimensions,
  isEditMode = false,
}: ChartDynamicControlsProps): React.JSX.Element | null {
  const [showDrilldownSettings, setShowDrilldownSettings] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // 拖拽处理函数
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (!isEditMode || !drilldownConfig || !onDrilldownConfigChange) return;
    
    try {
      const data = e.dataTransfer.getData(DRILLDOWN_DRAG_TYPE);
      if (data) {
        const dimensionName = data;
        // 检查是否已在列表中
        if (!drilldownConfig.dimensions.some(d => d.field === dimensionName)) {
          const dim = availableDimensions.find(d => d.name === dimensionName);
          if (dim) {
            handleAddDrilldownDimension(dimensionName);
          }
        }
      }
    } catch {
      // 忽略拖拽错误
    }
  }, [isEditMode, drilldownConfig, onDrilldownConfigChange, availableDimensions]);

  // 如果没有动态过滤器和下钻配置，则不显示
  if (dynamicFilters.length === 0 && !drilldownConfig?.enabled && !isEditMode) {
    return null;
  }

  const getFieldTitle = (fieldName: string) => {
    const field = availableFields.find(f => f.name === fieldName);
    // Use shortTitle for better display in dynamic filters
    return field?.shortTitle || field?.title || fieldName;
  };

  const getDimensionTitle = (fieldName: string) => {
    const dim = availableDimensions.find(d => d.name === fieldName);
    return dim?.title || fieldName;
  };

  const handleDrilldownToggle = () => {
    if (!onDrilldownConfigChange) return;
    
    if (drilldownConfig?.enabled) {
      // 关闭下钻
      onDrilldownConfigChange({ ...drilldownConfig, enabled: false });
    } else {
      // 开启下钻
      onDrilldownConfigChange({
        enabled: true,
        dimensions: [],
        selectionMode: 'multiple',
        allowEmptySelection: true,
      });
    }
  };

  const handleAddDrilldownDimension = (fieldName: string) => {
    if (!drilldownConfig || !onDrilldownConfigChange) return;
    
    const newDimension: DimensionConfig = {
      field: fieldName,
      title: getDimensionTitle(fieldName),
    };
    
    onDrilldownConfigChange({
      ...drilldownConfig,
      dimensions: [...drilldownConfig.dimensions, newDimension],
    });
  };

  const handleRemoveDrilldownDimension = (fieldName: string) => {
    if (!drilldownConfig || !onDrilldownConfigChange) return;
    
    onDrilldownConfigChange({
      ...drilldownConfig,
      dimensions: drilldownConfig.dimensions.filter(d => d.field !== fieldName),
    });
    
    // 同时从已选中移除
    onDrilldownChange(selectedDrilldownDimensions.filter(d => d !== fieldName));
  };

  const handleDrilldownDimensionToggle = (fieldName: string) => {
    if (drilldownConfig?.selectionMode === 'single') {
      // 单选模式：处理空选择和切换
      if (fieldName === '') {
        // 点击"无"选项，清空选择
        onDrilldownChange([]);
      } else {
        // 选择具体维度
        onDrilldownChange([fieldName]);
      }
    } else {
      // 多选模式：切换选择状态
      if (selectedDrilldownDimensions.includes(fieldName)) {
        const newSelection = selectedDrilldownDimensions.filter(d => d !== fieldName);
        if (newSelection.length === 0 && !drilldownConfig?.allowEmptySelection) {
          // 不允许空选，至少保留一个
          return;
        }
        onDrilldownChange(newSelection);
      } else {
        onDrilldownChange([...selectedDrilldownDimensions, fieldName]);
      }
    }
  };

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 space-y-2">
      {/* 动态过滤器区域 */}
      {dynamicFilters.length > 0 && (
        <div className="space-y-2">
          {dynamicFilters.map((filter, index) => {
            const isTimeRange = isTimeType(filter.type || '') && isRangeOperator(filter.operator);
            const currentValue = dynamicFilterValues[filter.field] || filter.defaultValues || [];
            const isFirst = index === 0;
            
            return (
              <div key={filter.field} className="flex items-center gap-2">
                {isFirst && (
                  <>
                    <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      <SlidersHorizontalIcon className="size-3.5" />
                      <span>动态过滤:</span>
                    </div>
                  </>
                )}
                {!isFirst && <div className="w-12" />}
                <div 
                  className="bg-white border border-blue-200 rounded-md px-3 py-1 text-xs flex-1 max-w-md"
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-gray-600 font-medium shrink-0">{getFieldTitle(filter.field)}</span>
                    <span className="text-gray-400 shrink-0">{getOperatorLabel(filter.operator)}</span>
                    {isTimeRange ? (
                      <div className="flex-1">
                        <TimeRangeFilter
                          value={currentValue}
                          onChange={values => onDynamicFilterChange(filter.field, values)}
                          size="sm"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={currentValue.join(', ')}
                        onChange={e => onDynamicFilterChange(filter.field, e.target.value.split(',').map(v => v.trim()).filter(Boolean))}
                        placeholder="输入值..."
                        className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    )}
                    {onRemoveDynamicFilter && (
                      <button
                        onClick={() => onRemoveDynamicFilter(filter.field)}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 ml-2"
                      >
                        <XIcon className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 维度下钻区域 */}
      {(drilldownConfig?.enabled || isEditMode) && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <LayersIcon className="size-3.5" />
            <span>动态维度下钻:</span>
          </div>
          
          {!drilldownConfig?.enabled ? (
            <button
              onClick={handleDrilldownToggle}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              <span>开启下钻</span>
            </button>
          ) : (
            <div className="flex-1 space-y-2">
              {/* 已配置的下钻维度 - 支持拖拽 */}
              <div 
                className={`flex items-center gap-2 flex-wrap min-h-[32px] p-1.5 rounded-md transition-colors ${
                  isEditMode && isDragOver 
                    ? 'bg-purple-50 border-2 border-dashed border-purple-300' 
                    : isEditMode 
                      ? 'border-2 border-dashed border-transparent hover:border-gray-200' 
                      : ''
                }`}
                onDragOver={isEditMode ? handleDragOver : undefined}
                onDragLeave={isEditMode ? handleDragLeave : undefined}
                onDrop={isEditMode ? handleDrop : undefined}
              >
                {drilldownConfig.dimensions.length === 0 && isEditMode && (
                  <span className="text-xs text-gray-400 italic">
                    {isDragOver ? '释放以添加维度' : '从左侧字段列表拖入维度...'}
                  </span>
                )}
                {drilldownConfig.selectionMode === 'single' ? (
                  // 单选模式：显示为切换按钮组
                  <div className="inline-flex rounded-md shadow-sm border border-gray-200">
                    {drilldownConfig.allowEmptySelection && (
                      <button
                        type="button"
                        onClick={() => handleDrilldownDimensionToggle('')}
                        className={`rounded-l-md px-2 py-0.5 text-xs font-medium transition-colors border-r border-gray-200 ${
                          selectedDrilldownDimensions.length === 0 
                            ? 'bg-purple-500 text-white border-purple-600' 
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        无
                      </button>
                    )}
                    {drilldownConfig.dimensions.map((dim, index) => {
                      const isSelected = selectedDrilldownDimensions.includes(dim.field);
                      const isFirst = !drilldownConfig.allowEmptySelection && index === 0;
                      const isLast = index === drilldownConfig.dimensions.length - 1;
                      const buttonClass = `
                        px-2 py-0.5 text-xs font-medium transition-colors
                        ${isFirst && !drilldownConfig.allowEmptySelection ? 'rounded-l-md' : ''}
                        ${isLast ? 'rounded-r-md' : ''}
                        ${!isLast ? 'border-r border-gray-200' : ''}
                        ${isSelected 
                          ? 'bg-purple-500 text-white border-purple-600' 
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                        }
                      `;
                      return (
                        <button
                          key={dim.field}
                          type="button"
                          onClick={() => handleDrilldownDimensionToggle(dim.field)}
                          className={buttonClass}
                        >
                          {dim.title || dim.field}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // 多选模式：显示为复选框列表
                  drilldownConfig.dimensions.map(dim => {
                    const isSelected = selectedDrilldownDimensions.includes(dim.field);
                    return (
                      <div
                        key={dim.field}
                        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs border ${
                          isSelected 
                            ? 'bg-purple-50 border-purple-200 text-purple-700' 
                            : 'bg-white border-gray-200 text-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleDrilldownDimensionToggle(dim.field)}
                          className="size-3 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span>{dim.title || dim.field}</span>
                        {isEditMode && (
                          <button
                            onClick={() => handleRemoveDrilldownDimension(dim.field)}
                            className="text-gray-300 hover:text-red-500 transition-colors ml-1"
                          >
                            <XIcon className="size-3" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
                
                {/* 编辑模式：添加维度下拉 */}
                {isEditMode && (
                  <div className="relative group">
                    <button className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors">
                      <span>+ 添加维度</span>
                      <ChevronDownIcon className="size-3" />
                    </button>
                    <div className="absolute left-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 max-h-48 overflow-auto">
                      {availableDimensions
                        .filter(d => !drilldownConfig.dimensions.some(ad => ad.field === d.name))
                        .map(dim => (
                          <button
                            key={dim.name}
                            onClick={() => handleAddDrilldownDimension(dim.name)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                          >
                            {dim.title || dim.name}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 下钻设置（编辑模式） */}
              {isEditMode && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowDrilldownSettings(!showDrilldownSettings)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    <SettingsIcon className="size-3" />
                    <span>设置</span>
                  </button>
                  
                  <button
                    onClick={handleDrilldownToggle}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    关闭下钻
                  </button>
                </div>
              )}

              {/* 下钻详细设置面板 */}
              {showDrilldownSettings && isEditMode && onDrilldownConfigChange && (
                <div className="bg-white border border-gray-200 rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="radio"
                        name="selectionMode"
                        checked={drilldownConfig.selectionMode === 'single'}
                        onChange={() => onDrilldownConfigChange({ ...drilldownConfig, selectionMode: 'single' })}
                        className="size-3 text-purple-600"
                      />
                      单选
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input
                        type="radio"
                        name="selectionMode"
                        checked={drilldownConfig.selectionMode === 'multiple'}
                        onChange={() => onDrilldownConfigChange({ ...drilldownConfig, selectionMode: 'multiple' })}
                        className="size-3 text-purple-600"
                      />
                      多选
                    </label>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={drilldownConfig.allowEmptySelection}
                      onChange={e => onDrilldownConfigChange({ 
                        ...drilldownConfig, 
                        allowEmptySelection: e.target.checked 
                      })}
                      className="size-3 rounded border-gray-300 text-purple-600"
                    />
                    允许不选中任何维度
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
