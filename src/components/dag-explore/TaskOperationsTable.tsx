import { useState, useEffect } from 'react';
import { taskAPI, TaskInstance } from '../../services/taskApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TaskOperationsTableProps {
  dagId: number;
  taskNames: Record<string, string>;
}

interface CellData {
  instances: TaskInstance[];
  finalStatus: 'success' | 'failed' | 'running' | 'none';
  hasRetries: boolean;
  lastEndTime?: string;
}

/** 与 backend task.ts formatPartitionDateKey 一致，用于匹配 instances 的列键 */
function partitionLookupKeyFromYmd(ymd: string): string {
  const utcDate = new Date(`${ymd}T00:00:00.000Z`);
  const beijingDate = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  return beijingDate.toISOString().slice(0, 19).replace('T', ' ');
}

/** 列键 `2026-05-05 08:00:00` → 表头短格式 `05-05` */
function mmddFromPartitionColumnKey(key: string): string {
  return key.slice(0, 10).slice(5);
}

interface TrendDataPoint {
  date: string;
  time: number; // 时间戳或分钟数
  timeStr: string; // 格式化的时间字符串
}

interface TrendData {
  rowKey: string;
  taskName: string;
  data: TrendDataPoint[];
}

export function TaskOperationsTable({ dagId, taskNames }: TaskOperationsTableProps) {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, Record<string, CellData>>>({});
  const [dateRange, setDateRange] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ rowKey: string; date: string } | null>(null);
  const [startTimeTrend, setStartTimeTrend] = useState<TrendData[]>([]);
  const [endTimeTrend, setEndTimeTrend] = useState<TrendData[]>([]);
  const [chartHeight, setChartHeight] = useState(192); // 默认高度

  useEffect(() => {
    const updateChartHeight = () => {
      setChartHeight(Math.floor(window.innerHeight / 3));
    };
    updateChartHeight();
    window.addEventListener('resize', updateChartHeight);
    return () => window.removeEventListener('resize', updateChartHeight);
  }, []);

  useEffect(() => {
    loadTaskInstances();
  }, [dagId, days]);

  const loadTaskInstances = async () => {
    setLoading(true);
    try {
      const response = await taskAPI.getTaskInstances(dagId, days);
      const rowKeysOrdered =
        response.rowKeys?.length > 0 ? response.rowKeys : response.taskFiles ?? [];

      // 日历日（本地）→ 与后端相同的 partition 列键，才能命中 instances[row][key]
      const dates: string[] = [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setDate(d.getDate() - i);
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates.push(partitionLookupKeyFromYmd(ymd));
      }
      setDateRange(dates);
      
      // Process instances into cell data
      const cellData: Record<string, Record<string, CellData>> = {};
      
      rowKeysOrdered.forEach(rowKey => {
        cellData[rowKey] = {};
        dates.forEach(date => {
          const instances = response.instances[rowKey]?.[date] || [];
          const lastSt = instances.length > 0 ? instances[instances.length - 1].status : '';
          const finalStatus =
            lastSt === 'success' || lastSt === 'failed' || lastSt === 'running'
              ? lastSt
              : 'none';
          const hasRetries = instances.length > 1;
          const lastEndTime = instances.length > 0 
            ? instances[instances.length - 1].end_time 
            : undefined;
          
          cellData[rowKey][date] = {
            instances,
            finalStatus,
            hasRetries,
            lastEndTime,
          };
        });
      });
      
      setData(cellData);

      // Process trend data
      const processTrendData = (type: 'start' | 'end'): TrendData[] => {
        return rowKeysOrdered.map(rowKey => {
          const trendPoints: TrendDataPoint[] = [];
          dates.forEach(date => {
            const instances = response.instances[rowKey]?.[date] || [];
            if (instances.length === 0) return;

            const successfulInstances = instances.filter(inst => inst.status === 'success');
            if (successfulInstances.length === 0) return;

            if (type === 'start') {
              // 最早一次任务开始时间
              const earliestStart = successfulInstances.reduce((earliest, inst) => {
                return new Date(inst.start_time) < new Date(earliest.start_time) ? inst : earliest;
              });
              const startDate = new Date(earliestStart.start_time);
              const timeInMinutes = startDate.getHours() * 60 + startDate.getMinutes();
              trendPoints.push({
                date: mmddFromPartitionColumnKey(date),
                time: timeInMinutes,
                timeStr: startDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              });
            } else {
              // 最后重试成功的结束时间
              const lastSuccess = successfulInstances[successfulInstances.length - 1];
              const endDate = new Date(lastSuccess.end_time);
              const timeInMinutes = endDate.getHours() * 60 + endDate.getMinutes();
              trendPoints.push({
                date: mmddFromPartitionColumnKey(date),
                time: timeInMinutes,
                timeStr: endDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
              });
            }
          });

          return {
            rowKey,
            taskName: getTaskName(rowKey),
            data: trendPoints
          };
        }).filter(trend => trend.data.length > 0);
      };

      setStartTimeTrend(processTrendData('start'));
      setEndTimeTrend(processTrendData('end'));
    } catch (error) {
      console.error('Error loading task instances:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCellColor = (cell: CellData): string => {
    if (cell.finalStatus === 'none') return 'bg-gray-100';
    if (cell.finalStatus === 'running') return 'bg-sky-600';
    if (cell.finalStatus === 'failed') return 'bg-red-500';
    if (cell.hasRetries) return 'bg-yellow-600';
    return 'bg-green-500';
  };

  const getTaskName = (rowKey: string): string => {
    return taskNames[rowKey] || rowKey;
  };

  const formatTimeAxis = (value: number) => {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-gray-200 rounded shadow-lg">
          <p className="text-sm font-medium text-gray-700">{`日期: ${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {`${entry.name}: ${entry.payload[`${entry.dataKey}_str`]}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  const selectedCellData = selectedCell ? data[selectedCell.rowKey]?.[selectedCell.date] : null;

  return (
    <div className="flex flex-col bg-white">
      {/* Controls */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600">查看天数:</label>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={3}>3天</option>
            <option value={7}>7天</option>
            <option value={14}>14天</option>
            <option value={30}>30天</option>
          </select>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded" />
            <span className="text-gray-600">一次成功</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-600 rounded" />
            <span className="text-gray-600">重试成功</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span className="text-gray-600">运行失败</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white shadow-sm">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b border-gray-200 min-w-[200px]">
                  任务节点
                </th>
                {dateRange.map(date => (
                  <th key={date} className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b border-gray-200 min-w-[100px]">
                    {mmddFromPartitionColumnKey(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(data).map(rowKey => (
                <tr key={rowKey} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                    {getTaskName(rowKey)}
                  </td>
                  {dateRange.map(date => {
                    const cell = data[rowKey]?.[date] || { instances: [], finalStatus: 'none', hasRetries: false };
                    const cellColor = getCellColor(cell);
                    const hasData = cell.finalStatus !== 'none';

                    return (
                      <td key={date} className="px-2 py-2">
                        {hasData ? (
                          <div
                            className={`w-full h-8 rounded cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center text-xs text-white font-medium ${cellColor}`}
                            onClick={() => setSelectedCell({ rowKey, date })}
                            title={cell.lastEndTime}
                          >
                            {cell.lastEndTime ? new Date(cell.lastEndTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        ) : (
                          <div className="w-full h-8 rounded bg-gray-100" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Trend Charts */}
      {!loading && (startTimeTrend.length > 0 || endTimeTrend.length > 0) && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Start Time Trend Chart */}
          {startTimeTrend.length > 0 && (() => {
            const startChartData = dateRange.map(d => {
              const mm = mmddFromPartitionColumnKey(d);
              const entry: Record<string, any> = { date: mm };
              startTimeTrend.forEach(trend => {
                const dataMap = Object.fromEntries(trend.data.map(td => [td.date, td]));
                const point = dataMap[mm];
                entry[trend.rowKey] = point?.time;
                entry[`${trend.rowKey}_str`] = point?.timeStr;
              });
              return entry;
            });
            return (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">任务启动时间趋势</h3>
                <div style={{ height: `${chartHeight}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={startChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatTimeAxis} tick={{ fontSize: 12 }} domain={[0, 1440]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      {startTimeTrend.map((trend, index) => (
                        <Line
                          key={trend.rowKey}
                          name={trend.taskName}
                          dataKey={trend.rowKey}
                          stroke={colors[index % colors.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* End Time Trend Chart */}
          {endTimeTrend.length > 0 && (() => {
            const endChartData = dateRange.map(d => {
              const mm = mmddFromPartitionColumnKey(d);
              const entry: Record<string, any> = { date: mm };
              endTimeTrend.forEach(trend => {
                const dataMap = Object.fromEntries(trend.data.map(td => [td.date, td]));
                const point = dataMap[mm];
                entry[trend.rowKey] = point?.time;
                entry[`${trend.rowKey}_str`] = point?.timeStr;
              });
              return entry;
            });
            return (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">任务完成时间趋势</h3>
                <div style={{ height: `${chartHeight}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={endChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatTimeAxis} tick={{ fontSize: 12 }} domain={[0, 1440]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      {endTimeTrend.map((trend, index) => (
                        <Line
                          key={trend.rowKey}
                          name={trend.taskName}
                          dataKey={trend.rowKey}
                          stroke={colors[index % colors.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedCell} onOpenChange={() => setSelectedCell(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>运行详情</DialogTitle>
          </DialogHeader>
          {selectedCell && selectedCellData && (
            <div className="py-4">
              <p className="text-sm text-gray-600 mb-4">
                任务: {getTaskName(selectedCell.rowKey)} | 日期: {selectedCell.date}
              </p>
              <div className="space-y-2">
                {selectedCellData.instances.map((inst, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      inst.status === 'success'
                        ? 'bg-green-50 border-green-200'
                        : inst.status === 'running'
                          ? 'bg-sky-50 border-sky-200'
                          : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        尝试 #{inst.attempt}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          inst.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : inst.status === 'running'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {inst.status === 'success' ? '成功' : inst.status === 'running' ? '运行中' : '失败'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600">
                      开始: {new Date(inst.start_time).toLocaleString('zh-CN')}
                    </div>
                    <div className="text-xs text-gray-600">
                      结束: {new Date(inst.end_time).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
