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
        return createAlloyEntryCode(code);
      }
    },
  };
}

export function createAlloyEntryCode(code: string): string {
  return `import Alloy from '/alloy';

// Always define globals to make sure they are the correct ones loaded via LiveView
global.Alloy = Alloy;
global._ = Alloy._;
global.Backbone = Alloy.Backbone;

${code}

let __alloyIndexController;
let __alloyIndexControllerStarted = false;

function __alloyLoadIndexController() {
	return __alloyIndexController ??= import('/alloy/controllers/index');
}

async function __alloyCreateIndexController() {
	if (__alloyIndexControllerStarted) return;
	__alloyIndexControllerStarted = true;

	const __alloyIndexControllerModule = await __alloyLoadIndexController();
	const IndexController = __alloyIndexControllerModule.default ?? __alloyIndexControllerModule;
	new IndexController();
}

Ti.UI.addEventListener('sessionbegin', function () {
	void __alloyCreateIndexController();
});

void __alloyLoadIndexController().then(function () {
	void __alloyCreateIndexController();
}).catch(function (error) {
	console.log('[alloy] index controller import failed', error);
});
`;
}
