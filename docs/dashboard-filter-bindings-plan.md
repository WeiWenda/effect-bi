# 看板筛选器：显式绑定与预览高亮 — 方案与实施步骤

## 1. 背景与问题

### 1.1 现状

- 看板筛选器使用 `FilterConfig[]` 存于 `DashboardInfo.filters`，在 `DashboardDetailPage` 中通过 `mergeFilters` 与每个图表的 `chart.filters` 合并后参与 Cube 查询。
- `allAvailableFields` 将**当前看板所有图表**的维度（及指标）按 **Cube 成员名 `field` 去重**后作为「添加过滤」的下拉选项；**不同图表下同名字段会合并为一条**，无法区分来源，标题也无法表达「属于哪张图」。
- 合并逻辑以 **`field` 字符串相同**即把看板筛选条件施加到查询上，未显式表达「该筛选器对哪些图表生效」；若某图表查询中并不包含该成员，可能产生无效条件或后端报错风险。

### 1.2 目标（产品）

1. **三段式字段列表**：来源 = 当前看板内**所有图表（view）**的**维度**（必要时可扩展下钻维度）；展示为 **图表 → 数据集（`viewName`）→ 维度字段**，选项文案优先使用 **`title`**（及 `shortTitle`）以降低重名混淆。
2. **显式绑定**：每个看板筛选器需配置 **按图表** 绑定的维度成员（`chartId` + 该图在该查询中使用的 `field`）。**未绑定某图表则该筛选器对该图表不生效**。
3. **配置交互**：绑定过程较复杂，**参考 DataEase「查询条件设置」**：左侧筛选器列表、中间「选择关联图表及字段」表格（可多图、每图一个字段下拉）、右侧筛选器展示类型/操作符/值等（可渐进实现，见阶段划分）。
4. **预览提示**：预览模式下在每个筛选条件前增加 **视图/图表图标**；**鼠标悬停**时 **高亮** 受该筛选器影响的图表区域，便于理解作用范围。

---

## 2. 数据模型

### 2.1 扩展 `FilterConfig`（看板专用字段）

在 `src/types/chart.ts` 的 `FilterConfig` 上增加可选字段（图表内 `filters` 不使用）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `chartBindings` | `{ chartId: number; field: string }[]` | 显式绑定：对该 `chartId` 的查询使用成员 `field`（与 `ChartConfig.dimensions[].field` 一致）。 |
| `displayName` | `string`（必填，存库） | 列表与取值条展示名；弹窗保存前校验非空。 |
| `timeRelative` | `{ amount, unit }`（可选） | 与 `inDateRange` / `notInDateRange` 配合：相对「查询当日」；发 Cube 前由 `expandFiltersForQuery` 展开为绝对 `values`。 |

**语义**：

- 若 **`chartBindings` 存在且长度 > 0**：仅对列表中出现且 `field` 非空的 `chartId` 生效；生成查询时将该看板条件的 **`member` 替换为绑定中的 `field`**（操作符、`values` 仍来自同一 `FilterConfig`）。
- 若 **`chartBindings` 缺省或为空数组**：视为**旧数据兼容**：保持与当前接近的行为——仅当该图表的维度/指标/下钻维度中存在与 `FilterConfig.field` 相同的成员名时，才将该看板筛选器加入该图查询（见 `resolveDashboardFiltersForChart`）。

**主字段 `FilterConfig.field`**：

- 新建看板筛选器时，可约定为「首个绑定字段」或占位成员名；查询侧**以绑定为准**，避免多图同语义不同成员名时无法落库。
- 编辑 UI 中「条件语义」仍以操作符 + 值为主，`field` 与绑定列同步或可推导。

### 2.2 三段式选项结构（前端派生，可不单独落库）

由 `charts: ChartConfig[]` 派生扁平选项列表，例如：

```ts
interface DashboardFilterFieldOption {
  chartId: number;
  chartName: string;      // 展示：图表名
  viewName: string;       // 展示：数据集 / Cube view
  field: string;          // 值：Cube 成员名
  title: string;          // 展示：维度 title，防重名
  type: string;
}
```

去重策略：以 `(chartId, field)` 唯一；同一图表同一维度只一条。不在全局按 `field` 合并。

---

## 3. 查询合并算法

在 `src/utils/dashboardFilterBindings.ts`（或等价路径）中集中实现：

1. **`chartMemberMatch(chart, memberField)`**  
   判断某成员是否可能出现在该图的查询中（至少包含：`dimensions`、`metrics`、`drilldownConfig.dimensions` 等，与 `buildCubeQueryFromChart` 一致）。

2. **`resolveDashboardFiltersForChart(chart, dashboardFilters)`**  
   - 对每条看板筛选器 `df`：  
     - 若有非空 `chartBindings`：查找 `chartId === chart.id` 且 `field` 非空的项，命中则输出 `{ ...df, field: binding.field }`；  
     - 否则走**兼容分支**：若 `chartMemberMatch(chart, df.field)` 为真，输出 `df`。

3. **`mergeFilters(chart, chartFilters, dashboardFilters)`**  
   先 `resolved = resolveDashboardFiltersForChart(...)`，再  
   `chartFilters` 去掉与 `resolved` 中任一 `field` 冲突的项（与现逻辑一致），最后拼接 `resolved`。

4. **`getAffectedChartIds(filter, charts)`**  
   - 有 `chartBindings`：返回其中 `field` 非空的 `chartId`；  
   - 否则：返回所有 `chartMemberMatch` 的图表 `id`（供预览 hover 高亮）。

`buildCubeQueryFromChart` 改为使用新的 `mergeFilters(chart, ...)`。

---

## 4. UI 方案（参考 DataEase）

### 4.1 编辑看板 — 筛选器配置主界面

**推荐**：独立大弹窗 **「看板查询条件设置」**（与查询页内嵌 `StaticFilterConfigZone` 小弹窗分离），三栏布局：

| 区域 | 内容 |
|------|------|
| 左 | 筛选器列表：添加、排序、重命名、可见性（可选）、选中项；底部可预留「级联配置」入口（后续迭代）。 |
| 中 | **选择关联图表及字段**：表格行 = 本看板图表（多选或全选）；每行：图表名、`viewName`、维度 `Select`（选项来自该图 `dimensions`，label 用 `title`）。支持「自动」与「自定义」模式（自动可按字段名启发式匹配，后续迭代）。 |
| 右 | 当前筛选器的展示类型、操作符、值来源等（可复用/抽取 `StaticFilterConfigZone` 中与类型相关的部分，或首版仍简化静态文本+操作符+值）。 |

首版可 **先实现中与右的核心**：绑定表 + 基础操作符/值；左栏可简化为仍用列表 + 点击进入弹窗编辑。

### 4.2 与现有 `StaticFilterConfigZone` 的关系

- **查询页**：继续使用 `StaticFilterConfigZone`，`availableFields` 来自单图元数据，不传 `chartBindings`。
- **看板**：传入 `charts`，使用 `DashboardFilterEditor`（新组件）或 `StaticFilterConfigZone` 的 `mode="dashboard"`，内部打开三栏弹窗并写回 `chartBindings`。

---

## 5. 预览 — 图表高亮

1. **状态**：在 `DashboardDetailPage`（或容器父级）维护 `highlightedChartIds: Set<number>` 或 `number | null`。
2. **筛选行 UI**：每条看板筛选条件前增加小图标（建议 `LayoutGrid` / `BarChart3` 等表示「关联图表」）；`onMouseEnter` 根据该条 `FilterConfig` 调 `getAffectedChartIds` 写入状态，`onMouseLeave` 清空。
3. **图表容器**：在 `TabGroupContainer` 内层每个图表卡片外层增加 `data-chart-id={chart.id}`，并由父级传入 `highlightedChartIds`：命中时增加 **ring / border / 阴影** 高亮 class（注意 z-index 与性能，仅 class 切换即可）。

编辑模式下可选同样高亮（降低实现成本可预览-only）。

---

## 6. 迁移与兼容

- 已存看板：`filters` 无 `chartBindings` → 走 `chartMemberMatch` 兼容路径，行为与升级前尽量一致。
- 新保存的筛选器：写入 `chartBindings`；中间表全不选时等价于「对该图不生效」。

---

## 7. 实施步骤（建议顺序）

| 阶段 | 内容 | 验收 |
|------|------|------|
| **1**（已落地） | 类型 `chartBindings` / `displayName`；`src/utils/dashboardFilterBindings.ts`；`buildCubeQueryFromChart` 使用 `mergeChartAndDashboardFilters` | 单测或手工：有/无绑定、多图、旧数据 |
| **2**（已落地） | 看板使用 `DashboardFilterConfigPanel` + `DashboardFilterEditModal`：表格列展示图表名、`viewName`、维度/指标下拉（`title` + `field` 文案） | 选项按图分列，不全局按 field 合并 |
| **3**（已落地） | 保存时写入 `chartBindings`（空数组表示显式不对任何图生效）；`displayName` | 随看板 layout/filters JSON 持久化 |
| **4**（已落地） | 筛选行前 `LayoutGrid` 图标，`mouseenter`/`leave` 驱动 `highlightChartIds`；`TabGroupContainer` 内卡片 `ring` 高亮 | 编辑/预览均可悬停查看作用范围；切换非预览模式时清除高亮 |
| **5**（可选） | DataEase 级联、默认值、选项值来源等增强 | 按产品优先级 |

---

## 8. 风险与备注

- **同图多绑定**：同一筛选器对同一 `chartId` 只应允许一条 `field`（若允许多成员需产品定义多条件拆分）。
- **下钻维度**：首版绑定列表可仅 `chart.dimensions`；若需下钻字段，在选项生成中合并 `drilldownConfig.dimensions` 并标注来源。
- **RTF 文本图**：无维度时通常不参与维度绑定；`getAffectedChartIds` 自然为空，高亮无影响。

---

## 9. 参考图

产品参考：`assets/composer-annotation-7e4fcc52-3a60-420a-ab67-9ab07c570084.png`（查询条件设置：左列表 / 中关联图表与字段 / 右条件配置）。

本文档随实现迭代可更新「验收」与阶段范围。
