# Cube.js 动态数据模型（JSON）约定

本项目采用 [Cube.js Dynamic Data Models](https://cube.dev/docs/product/data-modeling/dynamic/javascript) 方案，将 Cube 模型以 JSON 格式存储在数据库中，通过 `asyncModule()` 动态注册到 Cube Server。

## JSON 存储格式

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

## 服务端动态注册

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

## 完整 Schema 属性清单

### Cube 顶层属性

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

### Measure 属性

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

### Dimension 属性

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

### Join 属性

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
