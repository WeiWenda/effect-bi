# 标签组容器化改造技术文档

## 背景与目标

当前标签组实现：每个标签组内部有多个标签，每个标签下可以有多个图表，但图表是在标签组内部渲染的。

目标改造：标签组作为图表容器，可以将外部图表拖拽到标签组下，图表在标签组内部以网格布局展示，实现"外框包裹"效果。

## 核心概念

### 1. 图表归属关系

```
Dashboard
├── Charts (独立图表 - 直接显示在 Grid 中)
└── TabGroups (标签组容器)
    ├── Tab 1
    │   └── Charts (归属于 Tab 1 的图表)
    └── Tab 2
        └── Charts (归属于 Tab 2 的图表)
```

### 2. 数据模型变更

#### DashboardLayoutItem 扩展

```typescript
interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  widgetType?: DashboardWidgetType;
  markdownContent?: string;
  
  // TabGroup 相关字段
  tabGroupTabs?: TabGroupTab[];
  activeTabId?: string;
  
  // 新增：图表归属关系
  chartBelongsToTab?: string; // "tabGroupId:tabId" 格式
}
```

#### TabGroupTab 扩展

```typescript
interface TabGroupTab {
  id: string;
  label: string;
  chartIds: number[];
  // 新增：内部布局
  innerLayout?: TabInnerLayoutItem[];
}

interface TabInnerLayoutItem {
  chartId: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
```

## 功能设计

### 1. 拖拽分配图表到标签组

**场景A：从外部拖拽图表到标签组**
- 用户在 edit 模式下拖拽独立图表
- 拖拽到 TabGroup 区域时显示放置提示
- 释放后，图表从顶层 grid 移除，添加到 TabGroup 当前激活标签下

**场景B：在标签组内重新排列图表**
- 图表在 TabGroup 内可以自由拖拽调整位置
- 使用嵌套的 react-grid-layout 或 CSS Grid

**场景C：从标签组移出图表**
- 提供"移出"按钮
- 图表回到顶层 grid，放置在标签组下方或最后位置

### 2. 渲染层级

```
ReactGridLayout (顶层)
├── ChartWidget (独立图表)
├── MarkdownWidget
└── TabGroupWidget (容器)
    ├── Tab Bar (标签切换)
    └── Tab Content
        └── InnerGrid (内部网格)
            ├── ChartWidget (归属于此标签的图表)
            └── ChartWidget
```

### 3. 筛选器作用域可视化

当 Dashboard Filter 被添加时：
- 筛选器显示在顶部（类似之前的固定位置）
- 在 TabGroup 外框上显示标识，表示此筛选器影响组内图表
- 或在 TabGroup 标题栏显示应用的筛选器信息

### 4. 编辑模式交互

**TabGroup 编辑状态：**
- 显示"接收图表"区域提示
- 支持添加/删除标签
- 支持重命名标签
- 支持从组内移除图表

**图表拖拽指示器：**
- 拖拽图表经过 TabGroup 时高亮边框
- 释放区域提示

## 技术实现方案

### 阶段1：数据模型改造

1. 更新 `DashboardLayoutItem` 支持 `chartBelongsToTab` 字段
2. 更新 `TabGroupTab` 支持 `innerLayout`
3. 修改 `loadDashboard` 逻辑，正确分配图表到容器

### 阶段2：渲染逻辑改造

1. **顶层 Grid 渲染**
   - 只渲染不属于任何 TabGroup 的图表
   - 渲染所有独立 Widget（Markdown、Filter）
   - 渲染 TabGroup 容器

2. **TabGroup 内部渲染**
   - 使用 CSS Grid 或简单 Flex 布局
   - 每个图表保持原有渲染逻辑
   - 支持内部拖拽（可选）

### 阶段3：拖拽功能实现

1. **集成 react-dnd 或扩展 react-grid-layout**
   - 图表可以跨层级拖拽
   - TabGroup 作为 Drop Target

2. **拖拽状态管理**
   - `draggedChartId`: 当前拖拽的图表
   - `dropTargetTabGroup`: 目标标签组
   - `dropTargetTab`: 目标标签

### 阶段4：筛选器作用域

1. **作用域计算**
   ```typescript
   function getFilterScope(chartId: number, layout: DashboardLayoutItem[]): {
     type: 'global' | 'tab-group' | 'standalone';
     tabGroupId?: string;
   }
   ```

2. **可视化标识**
   - TabGroup 标题栏显示筛选器图标
   - 悬停显示影响的筛选器列表

## 数据结构示例

### 保存前的状态

```json
{
  "charts": [
    { "id": 1, "name": "销售趋势" },
    { "id": 2, "name": "用户增长" },
    { "id": 3, "name": "订单分布" }
  ],
  "layout": [
    { "i": "1", "x": 0, "y": 0, "w": 6, "h": 4 },
    { "i": "tab-group-123", "x": 6, "y": 0, "w": 6, "h": 8, 
      "widgetType": "tab-group",
      "tabGroupTabs": [
        { 
          "id": "tab-1", 
          "label": "销售分析", 
          "chartIds": [2, 3],
          "innerLayout": [
            { "chartId": 2, "x": 0, "y": 0, "w": 6, "h": 4 },
            { "chartId": 3, "x": 0, "y": 4, "w": 6, "h": 4 }
          ]
        }
      ]
    }
  ]
}
```

注意：图表2和3在顶层 layout 中没有独立条目，完全归属于 TabGroup。

## UI 设计

### TabGroup 容器外观

```
┌─────────────────────────────────────┐
│  📊 销售分析组                    ✕ │  ← 标题栏（紫色主题）
├─────────────────────────────────────┤
│  [销售分析] [用户分析] [+]          │  ← 标签栏
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────┐ ┌──────────────┐ │
│  │   用户增长    │ │   订单分布    │ │  ← 图表网格（2列）
│  │   [Chart]    │ │   [Chart]    │ │
│  └──────────────┘ └──────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### 编辑模式下的拖拽提示

```
┌─────────────────────────────────────┐
│  📊 销售分析组                    ✕ │
├─────────────────────────────────────┤
│  [销售分析] [用户分析] [+]          │
├─────────────────────────────────────┤
│                                     │
│         ┌─────────────┐             │
│         │   拖拽图表   │             │  ← 虚线框提示
│         │   到此处    │             │
│         └─────────────┘             │
│                                     │
└─────────────────────────────────────┘
```

## API 变更

### 后端 API

无需变更，layout 字段已经是 JSONB 格式，可以灵活存储扩展数据。

### 前端 API

更新 `dashboardAPI.update` 参数类型：

```typescript
interface UpdateDashboardData {
  name?: string;
  folderId?: number | null;
  filters?: FilterConfig[];
  layout?: DashboardLayoutItem[];
  // charts 保持不变，只是通过 layout 中的归属关系来组织
}
```

## 实现步骤

### Step 1: 数据模型扩展 ✅ 已完成
- 扩展 `DashboardLayoutItem` 类型
- 扩展 `TabGroupTab` 类型

### Step 2: 重构渲染逻辑
- 修改顶层 Grid 过滤逻辑
- 实现 TabGroup 内部图表网格

### Step 3: 拖拽功能
- 添加 react-dnd 或类似库
- 实现跨层级拖拽

### Step 4: 筛选器作用域可视化
- 计算图表与筛选器的关系
- 在 UI 上标识

## 风险评估

1. **向后兼容性**：旧数据没有 `innerLayout`，需要默认值处理
2. **性能**：嵌套图表可能影响渲染性能，需要优化
3. **用户体验**：拖拽操作可能不够直观，需要清晰的视觉反馈

## 验收标准

- [ ] 可以将图表从顶层拖拽到 TabGroup 内
- [ ] 可以将图表从 TabGroup 内移出到顶层
- [ ] TabGroup 内图表以网格布局展示
- [ ] TabGroup 外框清晰可见（紫色主题）
- [ ] 筛选器作用域在 UI 上有标识
- [ ] 保存后刷新页面，布局正确恢复
