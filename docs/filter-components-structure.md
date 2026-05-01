# Filter 相关组件含义与用途

## 概述

与「过滤条件」相关的 UI 主要位于 `src/components/filter/`，由 `index.ts` 统一导出（**不含**查询页中间栏的静态/动态过滤配置区，二者在 `query-explore`，见下）。`filter/` 内组件围绕类型 `FilterConfig` / `DynamicFilterConfig` 与运行时的「取值条」等。

更上层的**看板级筛选**（列表 + 弹窗）实现在 `src/components/dashboard-explore/` 的 `DashboardFilterConfigPanel`、`DashboardFilterEditModal`，它们复用本目录的 `FilterValueBar`，本身不属于 `filter` 包导出。

与查询页整体区域的关系见：[query-page-components-structure.md](./query-page-components-structure.md)（中间配置区的 `StaticFilterConfigZone`、`DynamicFilterConfigZone`（均在 `query-explore`），右侧的 `ChartDynamicControls`）。

## 模块入口

- **目录**: `src/components/filter/`
- **导出**: `src/components/filter/index.ts`（`FilterValueBar`、`StringMemberDistinctPicker`、`TimeRangeFilter`、`TimeRangeDualControl` 及对应类型）

## 组件关系示意

```
                    ┌─────────────────────────────┐
                    │   VisualQueryWorkspace      │
                    │   (中间栏 / 配置)            │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┴───────────────────────┐
           ▼                                               ▼
  StaticFilterConfigZone               DynamicFilterConfigZone
  (query-explore；静态 filters[])      (query-explore；dynamicFilters[] 配置)
           │                                               │
           └───────────────────┬───────────────────────────┘
                               ▼
                    TimeRangeFilter（时间类操作符时的日期 UI）
                               │
                               │  value: string[] / 相对段
                               ▼

  ChartDynamicControls（右侧运行时）
           │
           ▼
  FilterValueBar  ─────┬──► TimeRangeDualControl（结构化 timeRange / 相对）
           │           │
           │           └──► StringMemberDistinctPicker（Cube distinct 下拉/多选）
           │           └──► 普通 input（数字/文本等）
           │
           ▼
  DashboardFilterConfigPanel / DashboardFilterEditModal（看板）
           └──► FilterValueBar（同上，含 distinct、portal、formRowCompact 等）
```

## 各组件说明

### 1. StaticFilterConfigZone（静态过滤器配置区）

**路径**: `src/components/query-explore/StaticFilterConfigZone.tsx`（**不在** `filter/` 目录）  
**用途**: 在**可视化查询**中间栏，维护写入 Cube 查询的**静态** `filters: FilterConfig[]`（`isDynamic: false`）。  
**能力**:

- 按可用字段增删改过滤行；操作符随字段类型（字符串 / 数字 / 时间）切换。
- 时间范围类操作符走 `TimeRangeFilter`（来自 `filter/`），产出 `values`（及可选相对配置，与中间层模型一致）。
- 行内展示摘要文案；弹层或表单内编辑单条过滤。

**引用**: `VisualQueryWorkspace`（与 [query-page-components-structure.md](./query-page-components-structure.md) 中「3.4 StaticFilterConfigZone」一致）。

---

### 2. DynamicFilterConfigZone（动态过滤器配置区）

**路径**: `src/components/query-explore/DynamicFilterConfigZone.tsx`（**不在** `filter/` 目录）  
**用途**: 在**可视化查询**中间栏，维护 `dynamicFilters: DynamicFilterConfig[]`，供预览区运行时改条件。  
**能力**:

- 与静态面板类似的操作符 / 类型分支；时间类同样使用 `TimeRangeFilter`（来自 `filter/`）。
- 额外字段：必填、默认值、展示名等（动态过滤业务语义）。

**引用**: `VisualQueryWorkspace`（对应 query 文档「3.5 DynamicFilterConfigZone」）。

---

### 3. TimeRangeFilter（时间范围「扁平」编辑）

**路径**: `filter/TimeRangeFilter.tsx`  
**用途**: **配置态**下，以 `value: string[]`（及可选 `relativeSpec`）为主的时间区间编辑：预设、相对、绝对等模式，与 `react-datepicker` 配合。  
**特点**: 面向「写入 FilterConfig.values / 相对结构」的表单控件，被两个配置面板复用，**不**承担看板里持久化 `timeRange` 结构体的完整编辑（那是 `TimeRangeDualControl` 的职责）。

**引用**: `StaticFilterConfigZone`、`DynamicFilterConfigZone`。

---

### 4. TimeRangeDualControl（时间范围「结构化」编辑）

**路径**: `filter/TimeRangeDualControl.tsx`  
**用途**: 编辑 `TimeRangeSpec`（起止可为绝对 / 相对），多 Tab（预设、相对、绝对）、Portal 日历等，与 `filterTimeRelative` 工具深度配合。  
**引用**: 主要由 **`FilterValueBar`** 在时间类型 + 范围操作符时使用（运行时条、看板筛选取值条）。

---

### 5. StringMemberDistinctPicker（字符串成员 Distinct 选择）

**路径**: `filter/StringMemberDistinctPicker.tsx`  
**用途**: 对指定 `viewName` + `memberField` 发起 Cube `load`（单维度），用下拉 / 多选展示可选值。  
**关键参数**:

- `hideSourceAndRefresh`: 为 `true` 时隐藏「view · 维度」与手动刷新（仍会自动拉 distinct）。由 `FilterValueBar` 的 **`distinctShowSourceMeta`** 取反传入：默认在图表动态筛选、看板筛选**列表行**等场景隐藏；**看板筛选编辑弹窗**内取值条传 `distinctShowSourceMeta` 以展示来源与刷新。
- `compactCaption`: 与表单单行并排时的紧凑排版。
- `selectPortal`: 在 Dialog 内避免下拉被裁切。

**引用**: 仅 **`FilterValueBar`** 内部（不单独从 `index` 被业务页面直接使用）。

---

### 6. FilterValueBar（单行过滤取值条）

**路径**: `filter/FilterValueBar.tsx`  
**用途**: **运行时**一条过滤的展示：标题、操作符文案（可隐藏）、以及「取值」控件。统一了：

- 时间范围 → `TimeRangeDualControl`；
- 字符串且传入 `distinctQueryTarget` → `StringMemberDistinctPicker`（`hideSourceAndRefresh` 由 `distinctShowSourceMeta` 控制）；
- 其他 → 简单 input。

**引用**:

- `ChartDynamicControls`（查询页右侧，与 query 文档「4.1」一致）；
- `DashboardFilterConfigPanel`、`DashboardFilterEditModal`（看板筛选列表与编辑弹窗内「取值」）。

---

## 看板侧配套（非 `filter/` 目录）

| 组件 | 路径 | 含义 |
|------|------|------|
| DashboardFilterConfigPanel | `dashboard-explore/DashboardFilterConfigPanel.tsx` | 看板编辑侧：筛选条件列表、行内 `FilterValueBar`、打开编辑弹窗、悬停高亮关联图表。 |
| DashboardFilterEditModal | `dashboard-explore/DashboardFilterEditModal.tsx` | 添加/编辑单条看板筛选：显示名、操作符、`FilterValueBar` 取值、关联图表与维度表格（Cube meta）。 |

二者依赖 `src/utils/dashboardFilterBindings.ts`（如 `resolveDistinctQueryTarget`）与 `FilterValueBar` 的 `distinctQueryTarget` 衔接。

---

## 相关工具模块（非组件）

| 模块 | 用途 |
|------|------|
| `src/utils/filterTimeRelative.ts` | 相对时间、`TimeRangeSpec` 展开为查询用区间、与旧 `values` 迁移等。 |
| `src/utils/dashboardFilterBindings.ts` | 看板筛选与图表绑定、distinct 查询目标解析、合并进查询过滤等。 |

---

## 与查询页文档的交叉索引

| 本目录组件 | query-page-components-structure.md 中的位置 |
|------------|-----------------------------------------------|
| StaticFilterConfigZone（`query-explore`） | §3.4 Center Panel |
| DynamicFilterConfigZone（`query-explore`） | §3.5 Center Panel |
| FilterValueBar（经 ChartDynamicControls） | §4.1 Right Panel |
| TimeRangeFilter | 配置面板内部实现细节（未单独命名小节时可视为 StaticFilterConfigZone / Dynamic 的子能力） |
| TimeRangeDualControl | 运行时取值条内部（FilterValueBar） |

看板筛选 UI 不在 query 页结构图中，以本文「看板侧配套」为准。
