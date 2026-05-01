# 可视化查询 & 看板 技术方案

## 1. 需求概述

在现有 Cube 语义层建模能力基础上，新增两个一级页面：

| 页面 | 核心能力 | 参考产品 |
|------|---------|---------|
| **可视化查询** | 选择 View → 配置图表类型/维度/指标/过滤 → 实时渲染 | Superset Chart Editor |
| **看板** | 文件夹管理 → 看板级筛选器 → 图表网格布局 → 编辑回溯 | DataEase 仪表板 |

**联动机制**：可视化查询配置好的图表可 Pin 到看板；看板中点击图表可跳回可视化查询修改后覆盖。

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      Navbar (一级导航)                    │
│  Chat | Lineage | DAG | Cube | 查询 | 看板 | ETL         │
└─────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  /cube (建模)          /query (查询)         /dashboard (看板)
        │                     │                     │
  Cube Model           Visual Query          Dashboard
  Canvas+Fields        Left|Center|Right     Folder+Grid+Filter
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Cube Server API  │  (已有 Cube.js 实例)
                    │   /v1/v1/load      │
                    │   /v1/v1/sql       │
                    └───────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Backend API      │  (Express + PostgreSQL)
                    │   /api/chart       │
                    │   /api/dashboard   │
                    └───────────────────┘
```

---

## 3. 路由设计

| 路由 | 页面 | 说明 |
|------|------|------|
| `/query` | `Query` → `VisualQueryWorkspace`（page） | 可视化查询主页面 |
| `/query?chartId=123` | 同上 | 从看板跳入编辑模式，加载已有图表配置 |
| `/dashboard` | DashboardListPage | 看板文件夹列表 |
| `/dashboard/:id` | DashboardDetailPage | 看板详情（网格布局 + 筛选器） |

---

## 4. 数据库设计

### 4.1 charts 表 — 图表配置

```sql
CREATE TABLE IF NOT EXISTS charts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL DEFAULT '未命名图表',
  cube_name VARCHAR(256) NOT NULL,          -- 所属 Cube
  view_name VARCHAR(256) NOT NULL,          -- 使用的 View
  chart_type VARCHAR(32) NOT NULL DEFAULT 'table',  -- table|line|pie|number|bar
  dimensions JSONB NOT NULL DEFAULT '[]',   -- [{field, timeGranularity?}]
  metrics JSONB NOT NULL DEFAULT '[]',      -- [{field, aggregation?}] (维度拖入时需聚合方式)
  filters JSONB NOT NULL DEFAULT '[]',      -- [{field, operator, values}]
  sort JSONB NOT NULL DEFAULT '[]',         -- [{field, direction}]
  limit INTEGER DEFAULT 500,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charts_cube_view ON charts(cube_name, view_name);
```

**dimensions 字段结构**：
```typescript
interface DimensionConfig {
  field: string;           // 字段名，如 "orders.created_at"
  timeGranularity?: string; // 时间粒度：year|quarter|month|week|day|hour|minute (仅 time 类型)
}
```

**metrics 字段结构**：
```typescript
interface MetricConfig {
  field: string;           // 字段名
  aggregation?: string;    // 聚合方式：sum|avg|min|max|count|countDistinct (维度拖入时必填，指标拖入时为空)
  isDimensionAsMetric?: boolean;  // 标记是否为维度临时聚合为指标
}
```

**filters 字段结构**：
```typescript
interface FilterConfig {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'set' | 'notSet';
  values: any[];
}
```

### 4.2 dashboard_folders 表 — 看板文件夹

```sql
CREATE TABLE IF NOT EXISTS dashboard_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  parent_id INTEGER REFERENCES dashboard_folders(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3 dashboards 表 — 看板

```sql
CREATE TABLE IF NOT EXISTS dashboards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  folder_id INTEGER REFERENCES dashboard_folders(id) ON DELETE SET NULL,
  filters JSONB NOT NULL DEFAULT '[]',     -- 看板级筛选器配置 (同 chart filters 结构)
  layout JSONB NOT NULL DEFAULT '[]',       -- react-grid-layout 格式
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dashboards_folder ON dashboards(folder_id);
```

**layout 字段结构** (兼容 react-grid-layout)：
```typescript
interface DashboardLayoutItem {
  i: string;        // chartId (字符串)
  x: number;
  y: number;
  w: number;        // 宽度 (grid units)
  h: number;        // 高度 (grid units)
  minW?: number;
  minH?: number;
}
```

### 4.4 dashboard_charts 关联表

```sql
CREATE TABLE IF NOT EXISTS dashboard_charts (
  id SERIAL PRIMARY KEY,
  dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  chart_id INTEGER NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  position JSONB,                           -- 保留冗余，方便存额外位置信息
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dashboard_id, chart_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_charts_dashboard ON dashboard_charts(dashboard_id);
```

---

## 5. 后端 API 设计

### 5.1 图表 API — `/api/chart`

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/chart` | 创建图表 |
| GET | `/api/chart/:id` | 获取图表详情 |
| PUT | `/api/chart/:id` | 更新图表配置 |
| DELETE | `/api/chart/:id` | 删除图表 |

**POST/PUT Body**：
```json
{
  "name": "订单趋势",
  "cubeName": "example_cube",
  "viewName": "orders_view",
  "chartType": "line",
  "dimensions": [{"field": "orders.created_at", "timeGranularity": "day"}],
  "metrics": [{"field": "orders.total_amount", "aggregation": "sum"}],
  "filters": [{"field": "orders.status", "operator": "in", "values": ["completed"]}],
  "sort": [{"field": "orders.created_at", "direction": "asc"}],
  "limit": 500
}
```

### 5.2 看板 API — `/api/dashboard`

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/dashboard/folders` | 获取文件夹树 |
| POST | `/api/dashboard/folders` | 创建文件夹 |
| PUT | `/api/dashboard/folders/:id` | 重命名文件夹 |
| DELETE | `/api/dashboard/folders/:id` | 删除文件夹 |
| GET | `/api/dashboard` | 获取看板列表 (可按 folderId 过滤) |
| POST | `/api/dashboard` | 创建看板 |
| GET | `/api/dashboard/:id` | 获取看板详情 (含 charts 和 layout) |
| PUT | `/api/dashboard/:id` | 更新看板 (名称/筛选器/layout) |
| DELETE | `/api/dashboard/:id` | 删除看板 |
| POST | `/api/dashboard/:id/charts` | 添加图表到看板 |
| DELETE | `/api/dashboard/:id/charts/:chartId` | 从看板移除图表 |

### 5.3 Cube Server 代理 API — `/api/cube-proxy`

为避免前端直连 Cube Server 跨域问题，后端代理 Cube Server API：

| Method | Path | 说明 | 转发到 Cube Server |
|--------|------|------|-------------------|
| GET | `/api/cube-proxy/v1/v1/load` | 获取已加载的 View 列表 | `GET {CUBE_SERVER_URL}/v1/v1/load` |
| POST | `/api/cube-proxy/v1/v1/sql` | 执行查询 | `POST {CUBE_SERVER_URL}/v1/v1/sql` |
| POST | `/api/cube-proxy/v1/v1/sql-stream` | 流式查询 | `POST {CUBE_SERVER_URL}/v1/v1/sql-stream` |

**Cube Server 环境变量**：
```
CUBE_SERVER_URL=http://localhost:4000
CUBE_API_TOKEN=your_cube_api_token
```

**`/v1/v1/load` 响应结构** (Cube.js 标准)：
```json
{
  "cubes": [
    {
      "name": "orders",
      "title": "Orders",
      "measures": [
        {"name": "orders.count", "title": "Count", "type": "number"},
        {"name": "orders.total_amount", "title": "Total Amount", "type": "number"}
      ],
      "dimensions": [
        {"name": "orders.status", "title": "Status", "type": "string"},
        {"name": "orders.created_at", "title": "Created At", "type": "time"}
      ]
    }
  ]
}
```

**`/v1/v1/sql` 请求体** (Cube.js 标准)：
```json
{
  "query": {
    "measures": ["orders.total_amount"],
    "dimensions": ["orders.status"],
    "timeDimensions": [{
      "dimension": "orders.created_at",
      "granularity": "day",
      "dateRange": "last 30 days"
    }],
    "filters": [{
      "member": "orders.status",
      "operator": "equals",
      "values": ["completed"]
    }],
    "order": [["orders.created_at", "asc"]],
    "limit": 500
  }
}
```

---

## 6. 前端设计

### 6.1 可视化查询页面 — VisualQueryWorkspace（page）

**布局** (参考 Superset Chart Editor)：

```
┌──────────┬─────────────────────────────────┬──────────────────┐
│  左面板   │          中间配置区              │    右侧预览区     │
│ View列表  │  ┌───────────────────────────┐  │                  │
│          │  │ 可视化类型选择              │  │   Recharts 图表   │
│ ┌──────┐ │  │ [表格|线图|饼图|数字|柱状图] │  │   渲染区域       │
│ │View 1│ │  ├───────────────────────────┤  │                  │
│ │View 2│ │  │ 维度 (DropZone)            │  │                  │
│ │ ...  │ │  │ [orders.created_at ×]      │  │                  │
│ └──────┘ │  │   时间粒度: [day ▾]        │  │                  │
│          │  ├───────────────────────────┤  │                  │
│ ┌──────┐ │  │ 指标 (DropZone)            │  │                  │
│ │维度   │ │  │ [orders.total_amount ×]    │  │                  │
│ │ status│ │  │ [status → 聚合:count ×]   │  │                  │
│ │created│ │  ├───────────────────────────┤  │                  │
│ │_at    │ │  │ 过滤条件                   │  │                  │
│ ├──────┤ │  │ [+ 添加过滤]               │  │                  │
│ │指标   │ │  │ status = 'completed' ×    │  │                  │
│ │ count │ │  └───────────────────────────┘  │                  │
│ │amount │ │                                 │                  │
│ └──────┘ │                                 │                  │
│          │                                 │  [📌 Pin到看板]    │
└──────────┴─────────────────────────────────┴──────────────────┘
```

#### 左面板 — ViewSelectorPanel

- 调用 `/api/cube-proxy/v1/v1/load` 获取已加载的 cubes/views
- 用户选择 View 后，展示分组列表：
  - **维度** (dimensions)：按 type 标记图标 (string/number/time/boolean)
  - **指标** (measures)
- 字段支持拖拽 (HTML5 Drag) 到中间配置区

#### 中间配置区 — ChartConfigPanel

分为 4 个 DropZone 区域：

1. **可视化类型选择**：表格 / 线图 / 饼图 / 数字 / 柱状图，图标化选择
2. **维度 DropZone**：
   - 从左侧拖入维度字段
   - 若字段 type=time，弹出时间粒度选择 (year/quarter/month/week/day/hour/minute)
   - 支持排序设置
3. **指标 DropZone**：
   - 从左侧拖入指标字段 → 直接使用，无需选聚合
   - 从左侧拖入维度字段 → 弹出聚合方式选择 (sum/avg/min/max/count/countDistinct)
   - 标记 `isDimensionAsMetric: true`
4. **过滤条件**：
   - 参考 Cube Playground 的过滤条件配置
   - 点击"添加过滤" → 选择字段 → 选择操作符 → 填入值
   - 操作符根据字段类型动态展示 (time: dateRange / string: equals,contains,in / number: gt,gte,lt,lte)

#### 右侧预览区 — ChartPreviewPanel

- 配置变更后自动调用 `/api/cube-proxy/v1/v1/sql` 查询数据
- 使用 Recharts 渲染对应图表：
  - `table` → HTML 表格
  - `line` → `<LineChart>`
  - `pie` → `<PieChart>`
  - `number` → 大数字展示
  - `bar` → `<BarChart>`
- 底部 "📌 Pin 到看板" 按钮 → 保存图表并弹出选择目标看板

#### 查询转换逻辑

前端将 ChartConfig 转换为 Cube.js Query 格式：

```typescript
function buildCubeQuery(config: ChartConfig): CubeQuery {
  const query: CubeQuery = {
    measures: [],
    dimensions: [],
    timeDimensions: [],
    filters: [],
    order: [],
    limit: config.limit || 500,
  };

  // 维度
  for (const dim of config.dimensions) {
    if (dim.timeGranularity) {
      query.timeDimensions.push({
        dimension: dim.field,
        granularity: dim.timeGranularity,
      });
    } else {
      query.dimensions.push(dim.field);
    }
  }

  // 指标
  for (const metric of config.metrics) {
    if (metric.isDimensionAsMetric && metric.aggregation) {
      // 维度作为指标：Cube.js 中使用 measures 语法
      // 需要后端动态生成临时 measure 或使用 rawQuery
      query.measures.push(metric.field);
    } else {
      query.measures.push(metric.field);
    }
  }

  // 过滤
  for (const filter of config.filters) {
    query.filters.push({
      member: filter.field,
      operator: filter.operator,
      values: filter.values,
    });
  }

  // 排序
  for (const sort of config.sort) {
    query.order.push([sort.field, sort.direction]);
  }

  return query;
}
```

### 6.2 看板页面

#### 看板列表页 — DashboardListPage

```
┌─────────────────────────────────────────────────┐
│  📁 看板文件夹          [+ 新建文件夹] [+ 新建看板] │
│                                                  │
│  ┌────────┐  ┌────────┐  ┌────────┐             │
│  │ 📁 销售  │  │ 📁 运营  │  │ 📁 财务  │             │
│  │  3个看板 │  │  2个看板 │  │  1个看板 │             │
│  └────────┘  └────────┘  └────────┘             │
│                                                  │
│  ── 所有看板 ──                                   │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ 📊 销售日报    │  │ 📊 运营周报    │             │
│  │ 6 个图表      │  │ 4 个图表      │             │
│  │ 2024-01-15   │  │ 2024-01-14   │             │
│  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────┘
```

#### 看板详情页 — DashboardDetailPage

```
┌─────────────────────────────────────────────────┐
│ ← 返回  销售日报    [编辑] [添加图表] [添加筛选器]   │
├─────────────────────────────────────────────────┤
│ 🔍 看板筛选器: [状态 ▾ all] [日期范围 ▾]           │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────┐  ┌────────────────────────┐     │
│  │  订单趋势    │  │     销售额分布           │     │
│  │  📈 Line    │  │     🥧 Pie             │     │
│  │            │  │                        │     │
│  │  [✏️编辑]   │  │     [✏️编辑]            │     │
│  └────────────┘  └────────────────────────┘     │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │          订单明细表                        │    │
│  │          📋 Table                         │    │
│  │          [✏️编辑]                          │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

**关键设计点**：

1. **布局引擎**：使用 `react-grid-layout` 实现拖拽网格布局
2. **编辑模式 vs 预览模式**：
   - **编辑模式**：可拖拽调整布局、添加/删除图表，**不加载真实数据**（显示占位符或上次缓存数据）
   - **预览模式**：加载真实数据，应用看板级筛选器
3. **看板级筛选器**：
   - 看板可配置全局筛选器，应用于看板内所有图表
   - 筛选器值变更时，所有图表重新查询
   - 图表自身的过滤条件与看板筛选器合并 (AND)
4. **编辑回溯**：点击图表的"✏️编辑"按钮 → 跳转到 `/query?chartId=123` → 修改后保存覆盖原图表

### 6.3 Pin 到看板流程

```
可视化查询页面                          看板页面
─────────────                        ─────────
1. 配置图表
2. 点击 "📌 Pin到看板"
3. 弹出看板选择器
4. 选择目标看板
5. POST /api/chart (创建图表)
6. POST /api/dashboard/:id/charts (关联到看板)
                                     7. 看板中显示新图表
```

### 6.4 编辑回溯流程

```
看板页面                              可视化查询页面
─────────                            ────────────
1. 点击图表 "✏️编辑"                   2. 跳转 /query?chartId=123
                                      3. GET /api/chart/123 (加载配置)
                                      4. GET /api/cube-proxy/v1/v1/load (加载 View)
                                      5. 还原左/中/右面板状态
                                      6. 用户修改配置
                                      7. 点击 "保存" → PUT /api/chart/123
                                      8. 自动返回看板 (或提示已更新)
```

---

## 7. 新增依赖

### 前端

| 包名 | 用途 | 版本 |
|------|------|------|
| `react-grid-layout` | 看板拖拽网格布局 | ^1.4.x |
| `@types/react-grid-layout` | 类型定义 | ^1.4.x |
| `dnd-core` + `@react-dnd/core` | 可视化查询字段拖拽 | 可选，也可用 HTML5 原生 Drag |

> `recharts` 已在现有依赖中，无需新增。

### 后端

无需新增依赖，使用现有 `express` + `pg`。

---

## 8. 文件结构规划

### 前端新增文件

```
src/
├── components/
│   ├── query-explore/                    # 可视化查询
│   │   ├── VisualQueryWorkspace.tsx      # 主工作区 page / embed
│   │   ├── ViewSelectorPanel.tsx         # 左面板：View列表 + 维度/指标
│   │   ├── ChartConfigPanel.tsx          # 中间：图表配置区
│   │   ├── ChartPreviewPanel.tsx         # 右侧：图表预览渲染
│   │   ├── DimensionDropZone.tsx         # 维度拖放区
│   │   ├── MetricDropZone.tsx            # 指标拖放区
│   │   ├── FilterConfig.tsx             # 过滤条件配置
│   │   ├── ChartTypeSelector.tsx         # 可视化类型选择
│   │   ├── PinToDashboardDialog.tsx      # Pin到看板弹窗
│   │   └── chartRenderers/              # 各类型图表渲染器
│   │       ├── TableChart.tsx
│   │       ├── LineChart.tsx
│   │       ├── BarChart.tsx
│   │       ├── PieChart.tsx
│   │       └── NumberChart.tsx
│   ├── dashboard-explore/                # 看板
│   │   ├── DashboardListPage.tsx         # 看板列表 (含文件夹)
│   │   ├── DashboardDetailPage.tsx       # 看板详情 (网格布局)
│   │   ├── DashboardFolderTree.tsx       # 文件夹树
│   │   ├── DashboardGrid.tsx            # react-grid-layout 网格
│   │   ├── DashboardChartCard.tsx        # 单个图表卡片
│   │   ├── DashboardFilterBar.tsx       # 看板级筛选器
│   │   └── AddChartDialog.tsx           # 添加图表弹窗
│   ├── Query.tsx                         # 路由入口 (类似 Cubes.tsx)
│   └── Dashboard.tsx                    # 路由入口
├── services/
│   ├── chartApi.ts                       # 图表 CRUD API
│   ├── dashboardApi.ts                   # 看板 CRUD API
│   └── cubeProxyApi.ts                  # Cube Server 代理 API
└── types/
    └── chart.ts                          # 图表相关类型定义
```

### 后端新增文件

```
backend/
├── src/
│   └── routes/
│       ├── chart.ts                      # 图表 CRUD 路由
│       ├── dashboard.ts                  # 看板 CRUD 路由
│       └── cubeProxy.ts                 # Cube Server 代理路由
├── migrations/
│   ├── create_charts.sql
│   ├── create_dashboard_folders.sql
│   ├── create_dashboards.sql
│   └── create_dashboard_charts.sql
```

---

## 9. 开发计划

### Phase 1: 基础设施 (后端 + 路由)

1. 创建数据库迁移文件 (4 张表)
2. 实现后端 API 路由 (chart, dashboard, cubeProxy)
3. 前端新增路由入口 + Navbar 添加导航项
4. 前端新增 API service 文件 (chartApi, dashboardApi, cubeProxyApi)
5. 前端新增类型定义文件

### Phase 2: 可视化查询页面

6. 实现 ViewSelectorPanel (左面板)
7. 实现 ChartTypeSelector + DimensionDropZone + MetricDropZone
8. 实现 FilterConfig (过滤条件)
9. 实现 ChartConfigPanel (中间面板整合)
10. 实现 chartRenderers (5 种图表渲染器)
11. 实现 ChartPreviewPanel (右侧面板)
12. 实现 VisualQueryWorkspace 三栏布局（`Query` 路由 `variant="page"`）
13. 实现 PinToDashboardDialog
14. 实现查询转换逻辑 (ChartConfig → CubeQuery)

### Phase 3: 看板页面

15. 实现 DashboardFolderTree
16. 实现 DashboardListPage
17. 安装 react-grid-layout
18. 实现 DashboardGrid + DashboardChartCard
19. 实现 DashboardFilterBar
20. 实现 DashboardDetailPage
21. 实现 AddChartDialog
22. 实现编辑模式 (不加载真实数据) vs 预览模式

### Phase 4: 联动 & 完善

23. 实现 Pin 到看板完整流程
24. 实现编辑回溯流程 (看板→查询→保存→返回)
25. 看板级筛选器与图表过滤条件合并逻辑
26. 错误处理、Loading 状态、空状态优化

---

## 10. 关键技术细节

### 10.1 维度拖入指标区的聚合处理

当用户将维度字段拖入指标 DropZone 时：
- 弹出聚合方式选择弹窗 (sum/avg/min/max/count/countDistinct)
- 在 CubeQuery 构建时，需要后端支持动态生成临时 measure
- **方案**：后端 cubeProxy 路由在转发查询前，若检测到 `dimensionAsMetric` 请求，动态拼接 Cube.js 的 `query.measures` 使用 raw SQL 表达式

### 10.2 看板编辑模式不加载真实数据

- 编辑模式下，DashboardChartCard 显示：
  - 图表类型图标 + 图表名称
  - 上次缓存的缩略图 (可选)
  - 灰色占位区域
- 切换到预览模式时，批量加载所有图表数据
- 使用 `mode` state 控制：`'edit'` | `'preview'`

### 10.3 看板级筛选器合并

```typescript
function mergeFilters(chartFilters: FilterConfig[], dashboardFilters: FilterConfig[]): FilterConfig[] {
  // 看板筛选器覆盖图表同字段筛选条件
  const dashboardFieldSet = new Set(dashboardFilters.map(f => f.field));
  const merged = [
    ...chartFilters.filter(f => !dashboardFieldSet.has(f.field)),
    ...dashboardFilters,
  ];
  return merged;
}
```

### 10.4 Cube Server 认证

Cube Server API 通常需要 Authorization token：
```
Authorization: Bearer <token>
```
后端 cubeProxy 路由从环境变量读取 `CUBE_API_TOKEN`，自动附加到转发请求头。

### 10.5 防抖查询

可视化查询配置变更后，使用 500ms 防抖延迟发送查询请求，避免频繁调用 Cube Server。
