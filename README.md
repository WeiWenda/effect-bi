# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Cube.js Dynamic Data Model Schema

本项目采用 [Cube.js Dynamic Data Models](https://cube.dev/docs/product/data-modeling/dynamic/javascript) 方案，将 Cube 模型以 JSON 格式存储在数据库中，通过 `asyncModule()` 动态注册到 Cube Server。

### JSON 存储格式

```json
[
  {
    "name": "cube_name",
    "sql_table": "schema.table",
    "title": "Display Name",
    "description": "Description",
    "measures": {
      "measure_name": {
        "sql": "column_or_expression",
        "type": "count",
        "description": "Description"
      }
    },
    "dimensions": {
      "dim_name": {
        "sql": "column_or_expression",
        "type": "string",
        "description": "Description"
      }
    },
    "joins": {
      "joined_cube_name": {
        "sql": "{CUBE}.col = {joined_cube.col}",
        "relationship": "many_to_one"
      }
    }
  }
]
```

### 服务端动态注册

```js
// model/cubes/DynamicDataModel.js
const fetch = require("node-fetch");
import { transformDimensions, transformMeasures } from "./utils";

asyncModule(async () => {
  const dynamicCubes = await (
    await fetch("http://your-api-endpoint/dynamicCubes")
  ).json();

  dynamicCubes.forEach((dynamicCube) => {
    const dimensions = transformDimensions(dynamicCube.dimensions);
    const measures = transformMeasures(dynamicCube.measures);
    cube(dynamicCube.name, {
      sql: dynamicCube.sql,
      dimensions,
      measures,
      joins: dynamicCube.joins,
    });
  });
});
```

> **注意**：`asyncModule` 中 `sql` 和 `drill_members` 必须是函数类型 `() => string` / `() => string[]`，需要通过 `transformDimensions` / `transformMeasures` 转换。配合 `cube.js` 中的 `schemaVersion` 异步函数可实现模型变更时自动重编译。

### 完整 Schema 属性清单

#### Cube 顶层属性

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | Cube 唯一标识，snake_case，字母开头，仅含字母/数字/下划线 |
| `sql_table` | ✅ (与 `sql` 二选一) | string | 基表，格式 `schema.table`，等同于 `SELECT * FROM table` |
| `sql` | ✅ (与 `sql_table` 二选一) | string | 自定义 SQL 查询，无需 GROUP BY |
| `title` | | string | 显示名称，默认自动 humanize |
| `description` | | string | 人类可读描述，会暴露给 API |
| `data_source` | | string | 多数据源场景下指定数据源 |
| `sql_alias` | | string | 自定义 SQL 别名前缀，避免名称过长被截断 |
| `extends` | | string | 继承另一个 Cube 的所有成员 |
| `meta` | | object | 自定义元数据，可传递任意信息到前端 |
| `public` | | boolean | 是否可被 API 查询，默认 true |
| `refresh_key` | | string/object | 数据刷新策略，支持 SQL / interval / cron |
| `joins` | | object | 关联定义 |
| `measures` | | object | 指标定义 |
| `dimensions` | | object | 维度定义 |
| `pre_aggregations` | | object | 预聚合定义 |
| `segments` | | object | 数据过滤段定义 |
| `hierarchies` | | object | 层级定义 |
| `access_policy` | | object | 访问策略定义 |
| `calendar` | | boolean | 是否为日历 Cube，默认 false |

#### Measure 属性

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | 键名即 name，Cube 内唯一（与 dimensions/segments 不重复） |
| `type` | ✅ | string | 指标类型（见下表） |
| `sql` | 视 type | string | SQL 表达式，`count` 类型可省略 |
| `title` | | string | 显示名称 |
| `description` | | string | 描述 |
| `format` | | string | 格式化：`percent` / `currency` / 自定义 |
| `filters` | | Array<{sql: string}> | 过滤条件，如 `[{ sql: "{CUBE}.status = 'completed'" }]` |
| `drill_members` | | string[] | 下钻维度列表 |
| `public` | | boolean | 是否可被 API 查询，默认 true |
| `meta` | | object | 自定义元数据 |
| `mask` | | number/boolean/string/{sql} | 数据掩码替换值 |

**Measure Types：**

| 类型 | sql 要求 | 说明 |
|------|----------|------|
| `count` | 可省略 | 计数，自动处理 join 导致的行重复 |
| `sum` | 非聚合数值表达式 | 求和，如 `amount` 或 `fee * 0.1` |
| `avg` | 非聚合数值表达式 | 平均值 |
| `min` | 非聚合数值表达式 | 最小值 |
| `max` | 非聚合数值表达式 | 最大值 |
| `count_distinct` | 非聚合表达式 | 精确去重计数 |
| `count_distinct_approx` | 非聚合表达式 | 近似去重计数（HyperLogLog，可加性） |
| `number` | 聚合表达式 | 自定义聚合，如 `SUM(amount) / COUNT(*)` |
| `string` | 聚合表达式 | 字符串类型指标 |
| `time` | 聚合表达式 | 时间类型指标，如 `MAX(created_at)` |
| `boolean` | 聚合表达式 | 布尔类型指标，如 `BOOL_AND(status = 'completed')` |

#### Dimension 属性

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | 键名即 name，Cube 内唯一 |
| `type` | ✅ | string | 维度类型（见下表） |
| `sql` | ✅ | string | SQL 表达式 |
| `title` | | string | 显示名称 |
| `description` | | string | 描述 |
| `primary_key` | | boolean | 是否为主键 |
| `format` | | string | 格式化：`imageUrl` / `id` / `link` / `currency` / `percent` / 自定义 |
| `public` | | boolean | 是否可被 API 查询，默认 true |
| `meta` | | object | 自定义元数据 |
| `order` | | string | 排序方式 |
| `case` | | object | CASE WHEN 条件定义 |
| `mask` | | number/boolean/string/{sql} | 数据掩码替换值 |
| `sub_query` | | boolean | 是否为子查询维度（引用 measure） |
| `propagate_filters_to_sub_query` | | boolean | 是否将过滤器传递到子查询 |

**Dimension Types：**

| 类型 | 说明 |
|------|------|
| `string` | 字符串，支持 SQL 表达式如 `CONCAT({first_name}, ' ', {last_name})` |
| `number` | 数值 |
| `time` | 时间戳，需为 TIMESTAMP 类型（DATE 需 CAST） |
| `boolean` | 布尔 |
| `geo` | 地理位置类型 |
| `switch` | 枚举类型（Tesseract 预览功能），需配合 `values` 属性 |

#### Join 属性

| 属性 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `name` | ✅ | string | 目标 Cube 的 name，即键名 |
| `relationship` | ✅ | string | 关系类型（见下表） |
| `sql` | ✅ | string | Join 条件，使用 Cube.js 引用语法 |

**Join Relationship Types：**

| 类型 | 别名 | 说明 |
|------|------|------|
| `one_to_one` | `has_one` / `hasOne` | 一对一 |
| `one_to_many` | `has_many` / `hasMany` | 一对多 |
| `many_to_one` | `belongs_to` / `belongsTo` | 多对一 |

**Join SQL 引用语法：**

```
{CUBE}.column        — 当前 Cube 的列
{cube_name.column}   — 被关联 Cube 的列/维度
{cube_name.member}   — 被关联 Cube 的成员
```

示例：`{CUBE}.customer_id = {customers.id}`

现在进行一项大型任务，你需要先设计前后端技术方案，再按技术方案进行依次进行开发。需求如下:
1. Cube页面现在提供了拖拽生成报表语义层（即Cube Model）的能力，但是还缺少两个一级页面：可视化查询、看板
2. 可视化查询重点参考superset配置chart的左中右页面布局，左部分负责调用cube server api获取已加载的view列表，用户选择view后分组展示维度和指标列表。中部分用户分别选择a.可视化类型（表格、线图、饼图、数字、柱状图），b. 维度，如果是time字段，需要选择时间粒度 c.指标，如果将维度拖入这个区域，用户需要额外临时选择聚合方式，如果将指标拖入则不需要 d.过滤条件，可以参考cube playground的过滤条件配置方式。右部分调用cube的查询接口，渲染则使用对应的rechart图表
3. 看板重点参考dataease的仪表板，需要支持看板文件夹、看板级的筛选器，与dataease不同，为了避免无效查询，在调整图表布局时不需要加载真实的数据
4. 用户可以先在可视化查询处配置好图表pin到看板，也可以从看板处点击图表回到可视化查询处，修改完成后覆盖到原位置

可视化的右部分，顶部固定一片区域用来为当前图表设计动态过滤器和动态维度下钻，动态过滤器的设置与添加过滤条件类似，但是允许用户在图表看数过程中动态调整过滤三段式的取值部分，因此设置入口 在中部分添加过滤的弹窗中增加动态过滤勾选框，当勾选并确定后，出现在图表展示区的顶部，而非静态过滤条件区域。动态维度下钻的开启入口就在图表展示区的顶部，开启后用户可以从左侧字段列表拖入想要做动态维度下钻的维度列表，同时允许用户指定是单选风格，还是多选风格，以及是否允许不选中任何维度

现在开始设计ETL页面，ETL页面是一个类似浏览器的多tab页面，每次新建tab时用户可以在以下三个功能之间选择当前tab页的功能
1. 建表功能，暂不实现
2. 任务开发，目标是给用户提供可视化的SQL编写、试运行、运行依赖管理、运行监控配置、质量监控配置，最终产物是一个Ariflow dag文件，与cube发布类似后端负责将dag文件生成到AIRFLOW_HOME下
3. Ad-hoc功能，目标是让用户在ETL开发过程调试sql，布局分为左、右上、右下，左部与cube详情左部类似，展示gravitino处的catalog、schema、table，但区别是允许table再向下展开其column和数值类型。右上是SQL编写框，右下为提交查询按钮和查询结果展示区域，查询结果区域是一个左历史提交列表，右对应结果表格的多session风格，注意点击历史提交时，sql编写框也要回显当前的sql提交内容，从而实现sql调试全过程可回溯，sql提交内容和查询结果需要持久化到pg中，这样将来可以统一提供多用户查询历史后端监测能力（本次不用实现）。
只产出技术方案，先不开始实际开发