/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAVITINO_METALAKE: string;
  readonly VITE_AIRFLOW_UI_BASE_URL?: string;
  /** true 时仅展示元数据相关功能（隐藏 ETL / Cube / 可视化查询 / 看板） */
  readonly VITE_META_ONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
