#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { TransformName } from "./index.js";
import { transformNames } from "./index.js";

const require = createRequire(import.meta.url);
const [, , transformName, targetPath, ...forwardedArgs] = process.argv;

if (!isTransformName(transformName) || !targetPath) {
  printUsage();
  process.exitCode = 1;
} else {
  const jscodeshiftBin = require.resolve("jscodeshift/bin/jscodeshift.js");
  const transformPath = resolveTransformPath(transformName);
  const { runnerArgs, dry } = normalizeForwardedArgs(forwardedArgs);

  const child = spawn(
    process.execPath,
    [
      jscodeshiftBin,
      "--transform",
      transformPath,
      "--extensions=js,ts",
      "--ignore-pattern=**/{Resources,build,dist,modules,node_modules,plugins,references}/**",
      ...runnerArgs,
      targetPath,
    ],
    { stdio: "inherit" },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
    if (dry && process.exitCode === 0) {
      console.log(
        "Dry run completed. Re-run without --check or --dry to write changes.",
      );
    }
  });
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  vite-codemod <transform> <path> [jscodeshift options]",
      "",
      "Transforms:",
      ...transformNames.map((name) => `  - ${name}`),
      "",
      "Examples:",
      "  npx @titanium/vite-codemod migrate-cjs-exports app",
      "  npx @titanium/vite-codemod migrate-cjs-exports app --check",
    ].join("\n"),
  );
}

function isTransformName(value: string | undefined): value is TransformName {
  return transformNames.includes(value as TransformName);
}

function normalizeForwardedArgs(args: string[]) {
  const runnerArgs: string[] = [];
  let dry = false;

  for (const arg of args) {
    if (arg === "--check" || arg === "--dry") {
      runnerArgs.push("--dry");
      dry = true;
      continue;
    }

    if (arg === "--write") continue;
    runnerArgs.push(arg);
  }

  return { runnerArgs, dry };
}

function resolveTransformPath(transformName: TransformName) {
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );

  return path.join(packageRoot, "transforms", `${transformName}.cjs`);
}
