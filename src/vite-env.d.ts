/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAVITINO_METALAKE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
