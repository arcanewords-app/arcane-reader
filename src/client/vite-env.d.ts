/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_SUPPORT_BOOSTY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}

declare module 'preact' {
  namespace JSX {
    interface IntrinsicAttributes {
      /** preact-router injects the matched route path onto page components. */
      path?: string;
    }
  }
}

export {};
