# 动态过滤器与动态维度下钻技术方案

## 1. 功能概述

### 1.1 动态过滤器
- 在图表展示区顶部固定区域显示
- 在添加/编辑过滤条件的弹窗中增加"动态过滤"勾选框
- 勾选后，该过滤条件出现在图表展示区顶部而非静态过滤区域
- 允许用户在查看图表时动态调整过滤条件的取值部分

### 1.2 动态维度下钻
- 开启入口位于图表展示区顶部
- 开启后用户可从左侧字段列表拖入维度
- 支持单选/多选风格
- 支持配置是否允许不选中任何维度

## 2. 类型定义扩展

```typescript
// src/types/chart.ts

// 动态过滤配置
export interface DynamicFilterConfig {
  field: string;
  title?: string;
  shortTitle?: string;
  type?: string;
  operator: FilterOperator;
  // 动态过滤时，values 不固定，初始值可为空或默认值
  defaultValues?: any[];
}

// 动态维度下钻配置
export type DrilldownSelectionMode = 'single' | 'multiple';

export interface DynamicDrilldownConfig {
  enabled: boolean;
  dimensions: DimensionConfig[];  // 可下钻的维度列表
  selectionMode: DrilldownSelectionMode;
  allowEmptySelection: boolean;   // 是否允许不选中任何维度
  defaultSelected?: string[];     // 默认选中的维度字段名
}

// 图表配置扩展
export interface ChartConfig {
  id?: number;
  name: string;
  viewName: string;
  chartType: ChartType;
  dimensions: DimensionConfig[];
  metrics: MetricConfig[];
  filters: FilterConfig[];
  dynamicFilters?: DynamicFilterConfig[];  // 动态过滤器配置
  drilldownConfig?: DynamicDrilldownConfig; // 动态维度下钻配置
  sort: SortConfig[];
  limit: number;
  createdAt?: string;
  updatedAt?: string;
}
```

## 3. 组件设计

### 3.1 FilterConfigPanel 扩展
位置：`src/components/query-explore/FilterConfigPanel.tsx`

- 在添加/编辑过滤弹窗中增加"动态过滤"勾选框
- 勾选动态过滤后，过滤条件标记为 `isDynamic: true`
- 动态过滤器的值字段可设置默认值，也可以为空

### 3.2 ChartDynamicControls 组件（新增）
位置：`src/components/query-explore/ChartDynamicControls.tsx`

职责：
- 显示在图表展示区顶部
- 渲染动态过滤器控件（输入框、选择器等，根据操作符类型）
- 渲染动态维度下钻控件（维度选择器）
- 当动态过滤值或下钻维度变化时，触发重新查询

```typescript
interface ChartDynamicControlsProps {
  // 动态过滤器配置
  dynamicFilters: DynamicFilterConfig[];
  // 动态过滤器当前值
  dynamicFilterValues: Record<string, any[]>; // field -> values
  onDynamicFilterChange: (field: string, values: any[]) => void;
  
  // 动态维度下钻配置
  drilldownConfig?: DynamicDrilldownConfig;
  // 当前选中的下钻维度
  selectedDrilldownDimensions: string[];
  onDrilldownChange: (dimensions: string[]) => void;
  
  // 可用字段（用于显示标题等）
  availableFields: CubeMember[];
}
```

### 3.3 ChartRenderer 扩展
位置：`src/components/query-explore/ChartRenderer.tsx`

- 接收动态过滤后的数据和维度下钻配置
- 根据选中的下钻维度渲染图表

## 4. 数据流设计

### 4.1 VisualQueryPage 状态扩展

```typescript
// 新增状态
const [dynamicFilters, setDynamicFilters] = useState<DynamicFilterConfig[]>([]);
const [dynamicFilterValues, setDynamicFilterValues] = useState<Record<string, any[]>>({});
const [drilldownConfig, setDrilldownConfig] = useState<DynamicDrilldownConfig | undefined>(undefined);
const [selectedDrilldownDimensions, setSelectedDrilldownDimensions] = useState<string[]>([]);
```

### 4.2 查询逻辑扩展

`buildCubeQuery` 函数需要扩展：
- 合并静态 filters 和动态 dynamicFilterValues
- 根据 selectedDrilldownDimensions 替换/追加 dimensions

```typescript
function buildCubeQuery(
  chartType: ChartType,
  dimensions: DimensionConfig[],
  metrics: MetricConfig[],
  filters: FilterConfig[],
  dynamicFilterValues: Record<string, any[]>,
  drilldownDimensions: string[],
  drilldownConfig: DynamicDrilldownConfig | undefined,
  sort: SortConfig[],
  limit: number,
): CubeQuery {
  // 1. 合并静态和动态过滤器
  const allFilters = [
    ...filters,
    ...Object.entries(dynamicFilterValues)
      .filter(([_, values]) => values.length > 0)
      .map(([field, values]) => ({
        member: field,
        operator: 'in', // 动态过滤默认使用 in 操作符
        values,
      })),
  ];
  
  // 2. 处理维度下钻
  let finalDimensions = dimensions;
  if (drilldownConfig?.enabled && drilldownDimensions.length > 0) {
    // 使用选中的下钻维度替换或追加
    const drilldownDimConfigs = drilldownConfig.dimensions.filter(
      d => drilldownDimensions.includes(d.field)
    );
    finalDimensions = [...dimensions, ...drilldownDimConfigs];
  }
  
  // 3. 构建查询...
}
```

## 5. 交互设计

### 5.1 动态过滤器交互流程

1. 用户在中间面板点击"添加过滤"
2. 弹窗中配置字段、操作符、值
3. **新增**：勾选"动态过滤"复选框
4. 点击确定
5. 如果是动态过滤：
   - 条件不显示在中间面板静态过滤列表
   - 而是显示在右侧图表展示区顶部的动态控件区
6. 用户在查看图表时可直接修改动态过滤的值
7. 值修改后自动触发查询更新

### 5.2 动态维度下钻交互流程

1. 图表展示区顶部显示"维度下钻"开关按钮
2. 用户开启后：
   - 左侧字段列表标记可拖入的维度
   - 顶部显示维度选择区（可拖入/删除）
   - 显示配置选项：单选/多选、允许空选
3. 用户从左侧拖入维度到下钻选择区
4. 选中的维度作为图表的附加维度进行查询
5. 图表按选中维度分组展示

## 6. UI 布局设计

```
┌─────────────────────────────────────────────────────────────────┐
│  动态控件区（固定在顶部）                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [动态过滤1] [动态过滤2] ...  [维度下钻: ▼维度A ▼维度B]    │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        图表展示区                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 7. 数据库存储扩展

需要扩展 `charts` 表来存储动态过滤器和维度下钻配置：

```sql
-- 新增列
ALTER TABLE charts ADD COLUMN dynamic_filters JSONB DEFAULT '[]'::jsonb;
ALTER TABLE charts ADD COLUMN drilldown_config JSONB DEFAULT NULL;
```

## 8. 实现步骤

### Phase 1: 基础类型与组件
1. 扩展 `src/types/chart.ts` 类型定义
2. 创建 `ChartDynamicControls` 组件
3. 扩展 `FilterConfigPanel` 支持动态过滤勾选

### Phase 2: 数据流整合
1. 扩展 `VisualQueryPage` 状态管理
2. 修改 `buildCubeQuery` 支持动态过滤和下钻
3. 扩展 `ChartRenderer` 支持下钻维度

### Phase 3: 拖拽交互
1. 实现左侧字段列表到下钻区的拖拽
2. 实现维度选择器的单选/多选/空选控制

### Phase 4: 持久化
1. 更新后端 API 支持新字段存储
2. 扩展数据库迁移脚本
3. 更新保存/加载图表逻辑

### Phase 5: Dashboard 集成
1. 在 Dashboard 图表渲染中支持动态过滤和下钻
2. 确保看板中的图表也能使用动态控件

## 9. 关键设计决策

### 9.1 动态过滤器 vs 静态过滤器
- **静态过滤器**：设计时确定，用户查看时不可修改
- **动态过滤器**：设计时确定字段和操作符，用户查看时可修改取值

### 9.2 维度下钻实现方式
- 下钻维度**追加**到原有维度，而非替换
- 这样可以保留原始图表的分组逻辑，同时增加下钻能力
- 例如：原图表按"月份"分组，下钻"地区"后按"月份+地区"分组

### 9.3 动态过滤值的作用时机
- 动态过滤值**仅在运行时生效**，不保存到图表配置中
- 每次用户修改值后触发新查询
- 默认值可在图表配置中设定

## 10. API 变更

### 10.1 Chart API 扩展

```typescript
// 创建/更新图表接口
interface CreateChartRequest {
  name: string;
  viewName: string;
  chartType: ChartType;
  dimensions: DimensionConfig[];
  metrics: MetricConfig[];
  filters: FilterConfig[];
  dynamicFilters?: DynamicFilterConfig[];  // 新增
  drilldownConfig?: DynamicDrilldownConfig; // 新增
  sort: SortConfig[];
  limit: number;
}
```

### 10.2 Cube 查询 API 扩展

动态过滤值和下钻维度作为查询参数传递，不作为图表配置持久化：

```typescript
interface CubeQuery {
  measures: string[];
  dimensions: string[];
  timeDimensions: TimeDimensionQuery[];
  filters: FilterQuery[];
  dynamicFilters?: FilterQuery[]; // 运行时动态过滤值
  drilldownDimensions?: string[]; // 运行时选中的下钻维度
  order: [string, 'asc' | 'desc'][];
  limit?: number;
}
```
