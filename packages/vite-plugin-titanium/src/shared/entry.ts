import type { Plugin } from "vite";

const virtualEntries = ["virtual:titanium/app", "virtual:titanium/polyfills"];

export function virtualEntryPlugin(): Plugin {
  return {
    name: "titanium:virtual-entries",

    resolveId(source) {
      return virtualEntries.includes(source) ? `\0${source}` : null;
    },

    load(id) {
      if (id === `\0virtual:titanium/app`) {
        return {
          code: `import '/src/app.js';`,
        };
      } else if (id === `\0virtual:titanium/polyfills`) {
        return {
          code: `import '@titanium/polyfills';`,
        };
      }
    },
  }
}