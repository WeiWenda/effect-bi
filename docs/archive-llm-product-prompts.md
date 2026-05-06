# 历史需求 / LLM Prompt 存档

以下内容从仓库根目录 `README.md` 迁出，仅为**留档**（曾用于与 LLM 讨论方案或生成技术设计），**不代表当前实现状态或路线图承诺**。正式设计请以 `docs/` 下各 `*.md` 方案与代码为准。

---

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

---

etl发布时生成airflow dag的逻辑是，每有一条运行依赖，就生成一个airflow check_xx_ready节点，该节点每隔10s调用一次backend node.js的check依赖就绪接口，参数包含schema，database,table, 分区，（昨日分区为-1 day），二级分区（多值用英文逗号分割）。 直到接口返回true。多个check节点均指向真正的任务节点，任务节点在每次运行前需要将任务开始时间通过node.js接口注册到task_instances表中，每次运行成功/失败再次通过node.js接口更新task_instances记录，同时后端根据任务报警配置决定是否发送报警，这里需要一张table_partition_detail表，用来记录表的某个分区执行成功（失败不用记录）。还需要增加一张报警记录表记录报警来源、报警原因和是否已发送，因为有延时发送的情况，所以node.js需要额外暴露一个报警外部触发接口，我会在airflow上添加分钟级任务不断检查是否有待发送的报警。如果任务配置了质检规则，那么任务节点还需要指向quality节点，quality节点调用一次node.js接口，node.js接口内依次执行质检sql（提交trino查询），然后计算质检规则是否全部满足，如果不满足则标记table_partition_detail的is_verified为false，这将影响etl任务的check阶段是否返回true。
这是一个复杂任务，先产出技术方案到docs文件夹中，后按技术方案一步一步实现

---

整合一下etl_task_versions，task_info，etl_table_partition_detail，task_instances。task_info → etl_task_info，存储版本无关的信息，neo4j_node_id，table_name，catalog_name，schema_name，database_name，owner信息，同时去掉layer和description。etl_task_versions，存储版本相关的信息，增加外键etl_task_id（etl_task_info的主键）。etl_table_partition_detail存储表的分区产出信息，增加running_status。task_instances→etl_task_run_intances，存储任务运行重试信息，增加外键table_partition_id（etl_table_partition_detail的主键），去掉logical_partition_label。
不需要考虑平滑升级，直接汇总完整的create table ddl在migration，然后修改run-migration.ts迁移脚本即可
