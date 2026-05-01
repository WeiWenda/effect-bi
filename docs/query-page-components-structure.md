# 查询页面组件结构与区域关系文档

## 概述

查询路由 `Query` 直接渲染 `VisualQueryWorkspace`（`variant="page"`），构成三栏布局的可视化查询与图表配置页。本文档说明各区域、组件及其关系。

## 页面整体布局

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           Header (顶部操作栏)                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Left Panel    │ Center Panel        │ Right Panel                           │
│ (左侧面板)    │ (中间配置面板)      │ (右侧预览面板)                        │
│               │                    │                                       │
│ ViewSelector  │ ChartTypeSelector   │ ChartDynamicControls (运行时控件)        │
│               │ DimensionDropZone    │                                       │
│               │ MetricDropZone      │ ChartRenderer (图表渲染)               │
│               │ StaticFilterConfigZone │                                    │
│               │ DynamicFilterConfigZone │                                   │
│               │ DynamicDrilldownConfigZone │                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## 主要区域与组件详解

### 1. Header 区域 (顶部操作栏)
**位置**: 页面顶部，固定高度
**功能**: 页面标题、图表命名、查询执行、保存到看板

#### 包含组件:
- **页面标题区**: 显示"可视化查询"和当前选中的视图名称
- **图表名称输入框**: 用户可编辑图表名称
- **运行查询按钮**: 执行数据查询
- **Pin到看板按钮**: 将图表保存到看板

### 2. Left Panel (左侧面板)
**位置**: 页面左侧，固定宽度 256px
**功能**: 数据视图选择和元数据浏览

#### 核心组件:
- **ViewSelectorPanel**: 
  - 显示所有可用的数据视图/Cube
  - 支持搜索和分类浏览
  - 选择后加载对应的维度和指标元数据

### 3. Center Panel (中间配置面板)
**位置**: 页面中间，固定宽度 320px
**功能**: 图表配置，包括可视化类型、维度、指标、过滤器等

#### 核心组件:

##### 3.1 ChartTypeSelector (图表类型选择器)
- **功能**: 选择图表类型 (表格、折线图、柱状图、饼图、数字)
- **状态管理**: 控制 `chartType` 状态

##### 3.2 DimensionDropZone (维度拖放区)
- **功能**: 从左侧面板拖拽维度字段到图表
- **状态管理**: 管理 `dimensions` 数组
- **特性**: 支持拖拽排序、删除、时间粒度设置

##### 3.3 MetricDropZone (指标拖放区)
- **功能**: 从左侧面板拖拽指标字段到图表
- **状态管理**: 管理 `metrics` 数组
- **特性**: 支持拖拽排序、删除、聚合方式设置

##### 3.4 StaticFilterConfigZone (静态过滤器配置区)
- **位置**: `src/components/query-explore/StaticFilterConfigZone.tsx`
- **功能**: 配置静态查询过滤器
- **状态管理**: 管理 `filters` 数组
- **特性**: 支持多种操作符、值输入、AND/OR 逻辑

##### 3.5 DynamicFilterConfigZone (动态过滤器配置区)
- **位置**: `src/components/query-explore/DynamicFilterConfigZone.tsx`
- **功能**: 配置运行时可动态修改的过滤器
- **状态管理**: 管理 `dynamicFilters` 配置
- **特性**: 
  - 支持多种数据类型和操作符
  - 时间范围过滤器特殊处理
  - 默认值设置
  - 可配置为必填或可选

##### 3.6 DynamicDrilldownConfigZone (动态维度下钻配置区)
- **位置**: `src/components/query-explore/DynamicDrilldownConfigZone.tsx`
- **功能**: 配置运行时可动态选择的下钻维度
- **状态管理**: 管理 `drilldownConfig` 配置
- **特性**:
  - 支持拖拽添加维度
  - 单选/多选模式
  - 默认选中设置
  - 允许空选择配置

### 4. Right Panel (右侧预览面板)
**位置**: 页面右侧，自适应宽度
**功能**: 图表预览、动态控件交互、结果展示

#### 核心组件:

##### 4.1 ChartDynamicControls (运行时动态控件)
- **功能**: 运行时显示动态过滤器和维度下钻控件
- **状态管理**: 
  - `dynamicFilterValues`: 动态过滤器当前值
  - `selectedDrilldownDimensions`: 当前选中的下钻维度
- **特性**:
  - 实时过滤数据
  - 支持删除动态过滤器
  - 维度下钻切换
  - 时间范围选择器集成

##### 4.2 ChartRenderer (图表渲染器)
- **功能**: 根据配置渲染不同类型的图表
- **输入**: 图表类型、数据、维度、指标
- **支持的图表**: 表格、折线图、柱状图、饼图、数字卡片

##### 4.3 PinToDashboardDialog (保存到看板对话框)
- **功能**: 弹窗选择目标看板并保存图表
- **特性**: 看板列表、图表名称修改、保存逻辑

## 组件间数据流与状态管理

### 状态流向图
```
ViewSelectorPanel → selectedView → Center Panel (更新可用字段)
                    ↓
DimensionDropZone → dimensions → ChartRenderer (影响图表渲染)
                    ↓
MetricDropZone → metrics → ChartRenderer (影响图表渲染)
                    ↓
StaticFilterConfigZone → filters → buildCubeQuery → 查询数据
                    ↓
DynamicFilterConfigZone → dynamicFilters → ChartDynamicControls
                    ↓
DynamicDrilldownConfigZone → drilldownConfig → ChartDynamicControls
                    ↓
ChartDynamicControls → dynamicFilterValues/selectedDrilldownDimensions → 重新查询
```

### 关键状态管理

#### VisualQueryWorkspace（page）主状态:
- `selectedView`: 当前选中的数据视图
- `selectedCube`: 当前视图的元数据
- `chartType`: 图表类型
- `dimensions`: 维度配置数组
- `metrics`: 指标配置数组
- `filters`: 静态过滤器数组
- `dynamicFilters`: 动态过滤器配置数组
- `dynamicFilterValues`: 动态过滤器运行时值
- `drilldownConfig`: 动态维度下钻配置
- `selectedDrilldownDimensions`: 当前选中的下钻维度
- `sort`: 排序配置
- `queryData`: 查询结果数据
- `queryLoading`: 查询加载状态
- `chartName`: 图表名称

### 本地存储
- **Query Draft**: 自动保存用户配置到 localStorage
- **恢复机制**: 页面刷新后恢复上次配置

## 组件职责分离

### 配置时组件 (Center Panel)
- **职责**: 图表配置定义
- **特点**: 只在配置阶段显示，支持拖拽、编辑、删除
- **状态**: 影响查询结构

### 运行时组件 (Right Panel)
- **职责**: 数据交互和展示
- **特点**: 只在查询后显示，支持实时交互
- **状态**: 影响数据过滤和展示

### 元数据组件 (Left Panel)
- **职责**: 数据源浏览和选择
- **特点**: 独立的元数据管理
- **状态**: 影响可用字段和选项

## 交互流程

### 1. 基础查询流程
1. 用户在 ViewSelectorPanel 选择数据视图
2. 从 DimensionDropZone 和 MetricDropZone 拖拽字段
3. 在 StaticFilterConfigZone 配置静态过滤器
4. 点击"运行查询"执行查询
5. ChartRenderer 显示查询结果

### 2. 动态控件流程
1. 在 DynamicFilterConfigZone 配置动态过滤器
2. 在 DynamicDrilldownConfigZone 配置下钻维度
3. 运行查询后，ChartDynamicControls 显示交互控件
4. 用户修改动态控件值，实时更新图表

### 3. 保存流程
1. 点击"Pin到看板"按钮
2. PinToDashboardDialog 弹出看板选择
3. 选择看板并确认保存
4. 图表配置保存到后端并跳转到看板页面

## 技术特点

### 拖拽交互
- 使用 HTML5 Drag and Drop API
- 支持维度、指标的拖拽排序
- 下钻维度支持拖拽添加

### 实时更新
- 动态过滤器值变化立即重新查询
- 下钻维度切换实时更新图表
- 防抖处理避免频繁请求

### 响应式设计
- 三栏布局自适应
- 固定侧栏宽度，主内容区弹性
- 移动端适配考虑

### 状态持久化
- 自动保存草稿到 localStorage
- 页面刷新后恢复配置
- 编辑图表时加载历史配置

## 扩展点

### 新增图表类型
1. 在 ChartTypeSelector 添加新类型
2. 在 ChartRenderer 添加对应渲染逻辑
3. 更新类型定义文件

### 新增数据源
1. 扩展 ViewSelectorPanel 支持新数据源类型
2. 更新 cubeProxyAPI 适配新数据源
3. 调整字段类型映射

### 新增交互控件
1. 在 DynamicFilterConfigZone 添加新控件类型
2. 在 ChartDynamicControls 添加运行时渲染
3. 更新数据类型处理逻辑

## 性能优化建议

### 1. 组件懒加载
- ChartDynamicControls 按需渲染
- 大数据量时虚拟滚动

### 2. 状态优化
- 使用 useMemo 缓存计算结果
- 避免不必要的重新渲染

### 3. 查询优化
- 查询防抖处理
- 结果缓存机制
- 分页加载大数据

---

*本文档随代码更新而维护，最后更新时间: 2026-05-01*
