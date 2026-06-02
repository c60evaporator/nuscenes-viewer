/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module '*.yml' {
  const data: Record<string, unknown>
  export default data
}
