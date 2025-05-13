import type { Plugin } from "vite";

const VIRTUAL_ENTRY_ID = 'virtual:titanium/main'

export function virtualEntryPlugin(): Plugin {
  return {
    name: "titanium:classic:entry",

    resolveId(source) {
      return source === VIRTUAL_ENTRY_ID ? `\0${source}` : null;
    },

    load(id) {
      if (id === `\0${VIRTUAL_ENTRY_ID}`) {
        return {
          code: `import '/src/app.js';`,
        };
      }
    },
  }
}