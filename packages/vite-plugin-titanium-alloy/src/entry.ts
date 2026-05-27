import path from "node:path";
import type { Plugin } from "vite";

const VIRTUAL_ENTRY_ID = "virtual:titanium/main";

export function entryPlugin(appDir: string): Plugin {
  const ALLOY_ENTRY = path.resolve(appDir, "alloy.js");

  return {
    name: "titanium:alloy:entry",

    resolveId(id) {
      if (id === "/app") {
        return ALLOY_ENTRY;
      }
      if (id === VIRTUAL_ENTRY_ID) {
        return `\0${VIRTUAL_ENTRY_ID}`;
      }
    },

    load(id) {
      if (id === `\0${VIRTUAL_ENTRY_ID}`) {
        return {
          code: `import '/app';`,
        };
      }
    },

    transform(code, id) {
      if (id === ALLOY_ENTRY) {
        return `import Alloy from '/alloy';
import IndexController from '/alloy/controllers/index';

// Always define globals to make sure they are the correct ones loaded via LiveView
global.Alloy = Alloy;
global._ = Alloy._;
global.Backbone = Alloy.Backbone;

${code}

Ti.UI.addEventListener('sessionbegin', function () {
	new IndexController();
});

if ((typeof Ti.UI.hasSession === 'undefined') || Ti.UI.hasSession) {
	new IndexController();
}`;
      }
    },
  };
}
