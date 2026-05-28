export const transformNames = [
  "migrate-cjs-exports",
  "migrate-cjs-requires",
  "migrate-widget-wpath-requires",
] as const;

export type TransformName = (typeof transformNames)[number];
