import { readFile } from "node:fs/promises";
import type { Plugin } from "vite";

export function polyfillsPlugin(): Plugin {
  return {
    name: 'titanium:polyfills',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'polyfills.bootstrap.js',
        source: await readFile(import.meta.resolve('@titanium-sdk/polyfills').replace('file://', ''))
      })
    }
  }
}