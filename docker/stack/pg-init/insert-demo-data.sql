INSERT INTO public.etl_folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (2, '一级任务', null, 0, '2026-05-04 16:11:56.173071', '2026-05-05 16:51:50.242201');
INSERT INTO public.etl_folders (id, name, parent_id, sort_order, created_at, updated_at) VALUES (3, '二级任务', null, 0, '2026-05-05 16:52:59.642288', '2026-05-05 16:52:59.642288');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (20, 'SKU 属性扩充', null, 'dim_sku_attributes', 'localpg', 'demo', null, null, 1, 4, '2026-05-05 14:58:00.129814', '2026-05-05 08:23:27.305129');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (41, '库存快照加工', null, 'stg_inventory_snapshot', 'localpg', 'demo', null, null, 1, 7, '2026-05-05 15:01:06.436982', '2026-05-05 08:23:27.305129');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (31, '日销售聚合', null, 'agg_daily_sales', 'localpg', 'demo', null, null, 1, 5, '2026-05-05 14:59:30.299094', '2026-05-05 08:23:27.305129');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (36, 'Web 行为小时聚合', null, 'agg_hourly_traffic', 'localpg', 'demo', null, null, 1, 6, '2026-05-05 15:00:27.417740', '2026-05-05 08:23:27.305129');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (14, '门店维表加工', null, 'dim_store', 'localpg', 'demo', null, null, 1, 3, '2026-05-05 14:23:23.086257', '2026-05-05 08:23:27.305129');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (26, '订单行明细汇总', null, 'fact_order_lines', 'localpg', 'demo', null, null, 1, 2, '2026-05-05 14:58:46.013687', '2026-05-05 16:30:17.089307');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (75, 'etl_stg_pos_transactions', null, 'stg_pos_transactions', 'localpg', 'demo', null, null, 2, 0, '2026-05-05 16:53:04.851352', '2026-05-05 16:53:18.421980');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (85, 'etl_fact_order_lines', null, 'fact_order_lines', 'localpg', 'demo', null, null, 2, 0, '2026-05-05 16:54:36.910498', '2026-05-05 16:54:44.468567');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (80, 'etl_fact_orders', null, 'fact_orders', 'localpg', 'demo', null, null, 2, 0, '2026-05-05 16:53:55.723374', '2026-05-06 10:17:35.453109');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (51, '客户 360 汇总', null, 'mart_customer_360', 'localpg', 'demo', null, null, 1, 1, '2026-05-05 15:02:51.132484', '2026-05-07 06:53:11.777453');
INSERT INTO public.etl_task_info (id, name, neo4j_node_id, table_name, catalog_name, database_name, owner_name, owner_email, folder_id, folder_sort_order, created_at, updated_at) VALUES (46, '退货事实加载', null, 'fact_returns', 'localpg', 'demo', null, null, 1, 0, '2026-05-05 15:01:57.623681', '2026-05-07 06:28:50.727787');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (94, 31, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "fact_order_lines", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}, {"table": "dim_region", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:42:19.534373', '2026-05-05 20:42:21.278991');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (90, 51, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "dim_customer", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}, {"table": "fact_orders", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}, {"table": "fact_returns", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:40:51.569749', '2026-05-05 20:40:52.687817');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (91, 26, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "fact_orders", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}, {"table": "dim_product", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:41:07.456190', '2026-05-05 20:41:09.439180');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (95, 36, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "stg_web_events_raw", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:42:31.123849', '2026-05-05 20:42:32.197292');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (92, 14, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "dim_region", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:41:21.748362', '2026-05-05 20:41:23.601442');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (96, 41, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "dim_product", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:42:41.809877', '2026-05-05 20:42:43.321276');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (97, 85, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "fact_orders", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:42:53.264845', '2026-05-05 20:42:54.845067');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (98, 80, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "stg_pos_transactions", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:43:06.694262', '2026-05-05 20:43:07.593431');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (93, 20, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "dim_product", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:42:07.711322', '2026-05-05 20:42:08.531522');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (99, 75, '', false, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-04-29"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "dim_store", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-05 20:43:17.349791', '2026-05-05 20:43:19.191874');
INSERT INTO public.etl_task_versions (id, etl_task_id, remark, is_published, sql_main, schedule_json, alert_json, runtime_deps_json, quality_rules_json, created_at, updated_at) VALUES (2, 46, '', true, e'-- ETL 任务 SQL
SELECT 1', '{"owner": "etl", "retries": 1, "cronExpression": "0 0 * * *", "emailOnFailure": false, "retryDelayMinutes": 1, "scheduleStartDate": "2026-05-06"}', '{"rules": []}', '{"runtimeDependencies": [{"table": "fact_orders", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}, {"table": "fact_order_lines", "catalog": "localpg", "database": "demo", "partition": "-1 day", "secondaryPartitions": ""}]}', '{"rules": [], "sqlQueries": []}', '2026-05-07 06:58:53.307909', '2026-05-07 06:58:54.354168');

INSERT INTO public.cube_versions (id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at) VALUES (2, 'test_cube', '初始版本', false, '{}', '[]', '[]', '', '', '2026-05-07 07:03:48.095188', '2026-05-07 07:03:48.095188');
INSERT INTO public.cube_versions (id, name, remark, is_published, canvas_data, field_list, model_json, model_yml, model_view, created_at, updated_at) VALUES (4, 'test_cube', 'table_1_column_12', true, '{"edges": [], "nodes": [{"id": "table-1778137436193", "data": {"type": "table", "label": "etl_task_info", "table": "etl_task_info", "catalog": "localpg", "database": "public", "modelType": "fact"}, "type": "tableNode", "dragging": false, "measured": {"width": 200, "height": 104}, "position": {"x": 197.5, "y": 128}, "selected": false}], "viewport": {"x": 6.890956739527951, "y": -67.35179499669823, "zoom": 1.156688183905286}}', '[{"id": "table-1778137436193-id", "role": "dimension", "tableId": "table-1778137436193", "datatype": "external", "isManual": false, "isOutput": true, "fieldName": "id", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": true, "fieldDescription": ""}, {"id": "table-1778137436193-name", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(256)", "isManual": false, "isOutput": true, "fieldName": "name", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-neo4j_node_id", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(128)", "isManual": false, "isOutput": true, "fieldName": "neo4j_node_id", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-table_name", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(256)", "isManual": false, "isOutput": true, "fieldName": "table_name", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-catalog_name", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(256)", "isManual": false, "isOutput": true, "fieldName": "catalog_name", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-database_name", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(256)", "isManual": false, "isOutput": true, "fieldName": "database_name", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-owner_name", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(256)", "isManual": false, "isOutput": true, "fieldName": "owner_name", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-owner_email", "role": "dimension", "tableId": "table-1778137436193", "datatype": "varchar(256)", "isManual": false, "isOutput": true, "fieldName": "owner_email", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-folder_id", "role": "dimension", "tableId": "table-1778137436193", "datatype": "integer", "isManual": false, "isOutput": true, "fieldName": "folder_id", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-folder_sort_order", "role": "dimension", "tableId": "table-1778137436193", "datatype": "integer", "isManual": false, "isOutput": true, "fieldName": "folder_sort_order", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-created_at", "role": "dimension", "tableId": "table-1778137436193", "datatype": "timestamp(6)", "isManual": false, "isOutput": true, "fieldName": "created_at", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}, {"id": "table-1778137436193-updated_at", "role": "dimension", "tableId": "table-1778137436193", "datatype": "timestamp(6)", "isManual": false, "isOutput": true, "fieldName": "updated_at", "tableName": "etl_task_info", "expression": "", "isPrimaryKey": false, "fieldDescription": ""}]', '[{"name": "etl_task_info_4", "title": "etl_task_info", "measures": {}, "sql_table": "public.etl_task_info", "dimensions": {"id": {"sql": "{etl_task_info_4}.id", "type": "string", "primary_key": true}, "name": {"sql": "{etl_task_info_4}.name", "type": "string"}, "folder_id": {"sql": "{etl_task_info_4}.folder_id", "type": "number"}, "created_at": {"sql": "{etl_task_info_4}.created_at", "type": "time"}, "owner_name": {"sql": "{etl_task_info_4}.owner_name", "type": "string"}, "table_name": {"sql": "{etl_task_info_4}.table_name", "type": "string"}, "updated_at": {"sql": "{etl_task_info_4}.updated_at", "type": "time"}, "owner_email": {"sql": "{etl_task_info_4}.owner_email", "type": "string"}, "catalog_name": {"sql": "{etl_task_info_4}.catalog_name", "type": "string"}, "database_name": {"sql": "{etl_task_info_4}.database_name", "type": "string"}, "neo4j_node_id": {"sql": "{etl_task_info_4}.neo4j_node_id", "type": "string"}, "folder_sort_order": {"sql": "{etl_task_info_4}.folder_sort_order", "type": "number"}}, "description": "Cube for public.etl_task_info"}]', e'cubes:
  - name: etl_task_info_4
    title: etl_task_info
    description: Cube for public.etl_task_info
    sql_table: public.etl_task_info
    dimensions:
      - name: id
        sql: "{etl_task_info_4}.id"
        type: string
        primary_key: true
      - name: name
        sql: "{etl_task_info_4}.name"
        type: string
      - name: neo4j_node_id
        sql: "{etl_task_info_4}.neo4j_node_id"
        type: string
      - name: table_name
        sql: "{etl_task_info_4}.table_name"
        type: string
      - name: catalog_name
        sql: "{etl_task_info_4}.catalog_name"
        type: string
      - name: database_name
        sql: "{etl_task_info_4}.database_name"
        type: string
      - name: owner_name
        sql: "{etl_task_info_4}.owner_name"
        type: string
      - name: owner_email
        sql: "{etl_task_info_4}.owner_email"
        type: string
      - name: folder_id
        sql: "{etl_task_info_4}.folder_id"
        type: number
      - name: folder_sort_order
        sql: "{etl_task_info_4}.folder_sort_order"
        type: number
      - name: created_at
        sql: "{etl_task_info_4}.created_at"
        type: time
      - name: updated_at
        sql: "{etl_task_info_4}.updated_at"
        type: time
', e'views:
  - name: test_cube
    cubes:
      - join_path: etl_task_info_4
        includes:
          - id
          - name
          - neo4j_node_id
          - table_name
          - catalog_name
          - database_name
          - owner_name
          - owner_email
          - folder_id
          - folder_sort_order
          - created_at
          - updated_at
', '2026-05-07 07:33:49.752582', '2026-05-07 07:33:50.564710');

INSERT INTO public.charts (id, name, view_name, chart_type, dimensions, metrics, filters, sort, "limit", dynamic_filters, drilldown_config, rtf_text_config, created_at, updated_at) VALUES (1, '未命名图表', 'test_cube', 'table', '[{"type": "string", "field": "test_cube.name", "title": "Name"}, {"type": "string", "field": "test_cube.table_name", "title": "Table Name"}, {"type": "string", "field": "test_cube.catalog_name", "title": "Catalog Name"}, {"type": "string", "field": "test_cube.database_name", "title": "Database Name"}]', '[]', '[]', '[]', 500, '[]', null, null, '2026-05-07 07:34:28.817033', '2026-05-07 07:34:28.817033');

INSERT INTO public.dashboards (id, name, folder_id, sort_order, filters, layout, created_at, updated_at) VALUES (1, '测试看板', null, 0, '[]', '[{"h": 6, "i": "default-tab-group", "w": 12, "x": 0, "y": 0, "maxW": 12, "minH": 4, "minW": 12, "widgetType": "tab-group", "activeTabId": "default-tab-main", "tabGroupTabs": [{"id": "default-tab-main", "label": "默认", "chartIds": [1]}], "isDefaultTabGroup": true}]', '2026-05-07 07:34:27.086185', '2026-05-07 07:34:27.086185');

INSERT INTO public.dashboard_charts (id, dashboard_id, chart_id, position, created_at) VALUES (1, 1, 1, null, '2026-05-07 07:34:28.883073');
