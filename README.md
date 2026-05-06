# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Git 仓库初始化

本仓库为前端主工程；**`backend/langgraph`** 通过 **Git submodule** 指向 LangGraph / FastAPI 后端仓库 [`WeiWenda/chatbot-backend`](https://github.com/WeiWenda/chatbot-backend)。

### 首次克隆（推荐）

在仓库根目录一并拉取子模块，避免 `backend/langgraph` 为空：

```bash
git clone --recurse-submodules https://github.com/WeiWenda/chatbot-frontend.git chatbot
cd chatbot
```

### 已克隆但子模块目录为空

在仓库根目录执行：

```bash
git submodule update --init --recursive
```

### 日常拉取代码后

父仓库 `git pull` 后若子模块有更新，建议再执行：

```bash
git submodule update --init --recursive
```

### 将子模块跟踪到远端最新提交（可选）

会把父仓库里的子模块指针指到 `chatbot-backend` 默认分支的最新提交，**产生待提交变更**，按需再 `git add` / `commit`：

```bash
git submodule update --remote backend/langgraph
```

### 子模块本地开发

```bash
cd backend/langgraph
# 参考 .env.example 配置环境（如 .env.development，已被 .gitignore 忽略）
uv sync
```

若需将子模块 URL 改为 SSH，可编辑根目录 `.gitmodules` 中的 `url` 后执行：`git submodule sync`。

### 排错：LangGraph `[Errno 48] Address already in use`

表示 **默认端口 `8001`（或你设置的 `LANGGRAPH_PORT`）已被其它进程占用**（常见：上次 `dev:all` 未正常停止、本机另起了 uvicorn）。

1. 在仓库根执行 **`npm run dev:stop`** 后再 **`npm run dev:all`**。  
2. 若仍占用，查谁占用了端口（macOS）：`lsof -nP -iTCP:8001 -sTCP:LISTEN`，再 **`kill <pid>`**（确认无业务影响后再杀）。  
3. 改用其它端口：例如 **`LANGGRAPH_PORT=8002 npm run dev:all`**，并在仓库根 `.env` 中设置 **`VITE_LANGGRAPH_PROXY_TARGET=http://127.0.0.1:8002`**（单独跑 `npm run dev` 时同样需要）。

`scripts/dev-services.sh` 在启动前会检测端口占用并打印上述提示，避免仅看到 `.dev-pids/langgraph.log` 里的 uvicorn 报错。

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

etl发布时生成airflow dag的逻辑是，每有一条运行依赖，就生成一个airflow check_xx_ready节点，该节点每隔10s调用一次backend node.js的check依赖就绪接口，参数包含schema，database,table, 分区，（昨日分区为-1 day），二级分区（多值用英文逗号分割）。 直到接口返回true。多个check节点均指向真正的任务节点，任务节点在每次运行前需要将任务开始时间通过node.js接口注册到task_instances表中，每次运行成功/失败再次通过node.js接口更新task_instances记录，同时后端根据任务报警配置决定是否发送报警，这里需要一张table_partition_detail表，用来记录表的某个分区执行成功（失败不用记录）。还需要增加一张报警记录表记录报警来源、报警原因和是否已发送，因为有延时发送的情况，所以node.js需要额外暴露一个报警外部触发接口，我会在airflow上添加分钟级任务不断检查是否有待发送的报警。如果任务配置了质检规则，那么任务节点还需要指向quality节点，quality节点调用一次node.js接口，node.js接口内依次执行质检sql（提交trino查询），然后计算质检规则是否全部满足，如果不满足则标记table_partition_detail的is_verified为false，这将影响etl任务的check阶段是否返回true。
这是一个复杂任务，先产出技术方案到docs文件夹中，后按技术方案一步一步实现

整合一下etl_task_versions，task_info，etl_table_partition_detail，task_instances。task_info → etl_task_info，存储版本无关的信息，neo4j_node_id，table_name，catalog_name，schema_name，database_name，owner信息，同时去掉layer和description。etl_task_versions，存储版本相关的信息，增加外键etl_task_id（etl_task_info的主键）。etl_table_partition_detail存储表的分区产出信息，增加running_status。task_instances→etl_task_run_intances，存储任务运行重试信息，增加外键table_partition_id（etl_table_partition_detail的主键），去掉logical_partition_label。
不需要考虑平滑升级，直接汇总完整的create table ddl在migration，然后修改run-migration.ts迁移脚本即可