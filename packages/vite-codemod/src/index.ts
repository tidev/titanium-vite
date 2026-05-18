export const transformNames = ["migrate-cjs-exports"] as const;

export type TransformName = (typeof transformNames)[number];
