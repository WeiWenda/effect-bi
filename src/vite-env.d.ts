/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAVITINO_METALAKE: string;
  readonly VITE_AIRFLOW_UI_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
