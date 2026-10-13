/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API base URL, e.g. https://api.example.org/api (default http://localhost:3001/api). */
  readonly VITE_API_URL?: string;
  /** "true" once the API sends email (src/lib/features.ts). */
  readonly VITE_EMAIL_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
