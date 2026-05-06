import { XIcon } from 'lucide-react';
import type { MetricConfig, AggregationType } from '../../types/chart';
import { useToast } from '../ui/toast';

interface MetricDropZoneProps {
  metrics: MetricConfig[];
  onChange: (metrics: MetricConfig[]) => void;
  /** 最大指标数限制；undefined 表示不限制 */
  maxMetrics?: number;
}

const AGGREGATION_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: 'sum', label: '求和 (SUM)' },
  { value: 'avg', label: '平均 (AVG)' },
  { value: 'min', label: '最小 (MIN)' },
  { value: 'max', label: '最大 (MAX)' },
  { value: 'count', label: '计数 (COUNT)' },
  { value: 'countDistinct', label: '去重计数 (COUNT DISTINCT)' },
];

export function MetricDropZone({ metrics, onChange, maxMetrics }: MetricDropZoneProps): React.JSX.Element {
  const { toast } = useToast();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      // Avoid duplicates
      if (metrics.some(m => m.field === data.name)) return;
      // 已达上限时提示用户先删除后添加
      if (maxMetrics != null && metrics.length >= maxMetrics) {
        toast(`该图表最多支持 ${maxMetrics} 个指标，请先删除已有指标再添加`, 'info');
        return;
      }

      const newMetric: MetricConfig = {
        field: data.name,
        title: data.title || data.name,
        type: data.type,
      };

      // If a dimension is dragged in, it needs aggregation
      if (data.memberType === 'dimension') {
        newMetric.isDimensionAsMetric = true;
        newMetric.aggregation = 'sum'; // default aggregation
      }

      onChange([...metrics, newMetric]);
    } catch {}
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const removeMetric = (index: number) => {
    onChange(metrics.filter((_, i) => i !== index));
  };

  const updateAggregation = (index: number, aggregation: AggregationType) => {
    onChange(metrics.map((m, i) => i === index ? { ...m, aggregation } : m));
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={`min-h-[60px] rounded-lg border-2 border-dashed p-2 transition-colors ${
        metrics.length === 0 ? 'border-gray-200 bg-gray-50' : 'border-green-200 bg-green-50/50'
      }`}
    >
      <div className="text-xs font-medium text-gray-400 mb-1.5">指标</div>
      {metrics.length === 0 ? (
        <div className="text-xs text-gray-300 text-center py-2">拖入指标或维度字段</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {metrics.map((metric, idx) => (
            <div key={metric.field} className="flex items-center gap-1 bg-white border border-green-200 rounded-md px-2 py-1 text-xs shadow-sm">
              <span className="text-gray-700">{metric.title || metric.field}</span>
              {metric.isDimensionAsMetric && (
                <select
                  value={metric.aggregation || 'sum'}
                  onChange={e => updateAggregation(idx, e.target.value as AggregationType)}
                  className="ml-1 text-xs border border-gray-200 rounded px-1 py-0.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-green-400"
                  onClick={e => e.stopPropagation()}
                >
                  {AGGREGATION_OPTIONS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => removeMetric(idx)}
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
