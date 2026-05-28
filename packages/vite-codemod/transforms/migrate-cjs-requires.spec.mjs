import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const jscodeshift = require("jscodeshift");
const transform = require("./migrate-cjs-requires.cjs");
const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/alloy-app",
);
const appControllerPath = path.join(fixtureRoot, "app/controllers/index.js");
const appUtilsPath = path.join(fixtureRoot, "app/lib/app-utils.js");
const datePickerPath = path.join(fixtureRoot, "app/lib/date-picker.js");

function run(source, options = {}, path = "app/controllers/index.js") {
  return transform(
    { path, source },
    { jscodeshift },
    options,
  );
}

describe("migrate-cjs-requires", () => {
  test("converts top-level static require declarations to namespace imports", () => {
    expect(
      run("const XP = require('xp.ui');\nXP.createView();\n", {}, appControllerPath),
    ).toBe(
      'import * as XP from "~/lib/xp.ui";\nXP.createView();\n',
    );
  });

  test("converts static JSON require declarations to default imports", () => {
    expect(
      run(
        "const countries = require('json/countries/en.json');\ncountries.DE;\n",
        {},
        appControllerPath,
      ),
    ).toBe(
      'import countries from "~/assets/json/countries/en.json";\ncountries.DE;\n',
    );
  });

  test("rewrites existing app-local JSON imports to alias imports", () => {
    expect(
      run(
        'import countries from "json/countries/en.json";\ncountries.DE;\n',
        {},
        appControllerPath,
      ),
    ).toBe(
      'import countries from "~/assets/json/countries/en.json";\ncountries.DE;\n',
    );
  });

  test("converts default member requires to default imports", () => {
    expect(
      run("const Api = require('/api').default;\nApi.fetch();\n", {}, appControllerPath),
    ).toBe(
      'import Api from "~/lib/api";\nApi.fetch();\n',
    );
  });

  test("rewrites app-local lib imports to alias imports", () => {
    expect(
      run("const utils = require('app-utils');\nutils.setup();\n", {}, appControllerPath),
    ).toBe(
      'import * as utils from "~/lib/app-utils";\nutils.setup();\n',
    );
  });

  test("converts package, native, and builtin whole-module requires to default imports", () => {
    expect(
      run(
        "const path = require('path');\nconst Ability = require('@casl/ability');\nconst map = require('ti.map');\nconst analytics = require('firebase.analytics');\n",
      ),
    ).toBe(
      'import path from "path";\nimport Ability from "@casl/ability";\nimport map from "ti.map";\nimport analytics from "firebase.analytics";\n',
    );
  });

  test("converts named member requires to named imports", () => {
    expect(
      run(
        "const createButton = require('xp.ui').createActionButton;\n",
        {},
        appControllerPath,
      ),
    ).toBe('import { createActionButton as createButton } from "~/lib/xp.ui";\n');
  });

  test("converts object destructuring requires to named imports", () => {
    expect(
      run(
        "const { createView, createActionButton: createButton } = require('xp.ui');\n",
      ),
    ).toBe(
      'import { createView, createActionButton as createButton } from "xp.ui";\n',
    );
  });

  test("leaves destructured JSON requires unchanged", () => {
    expect(run("const { DE } = require('json/countries/en.json');\n")).toBe(
      "const { DE } = require('json/countries/en.json');\n",
    );
  });

  test("converts return requires by default", () => {
    expect(run("function load() {\n\treturn require('ti.calendar');\n}\n")).toBe(
      'import tiCalendar from "ti.calendar";\nfunction load() {\n\treturn tiCalendar;\n}\n',
    );
  });

  test("fails on unsupported CommonJS syntax when requested", () => {
    expect(() =>
      run("require('ti.calendar');\n", {
        failOnUnsupported: "true",
      }),
    ).toThrow(
      "Unsupported CommonJS require() in app/controllers/index.js:1.",
    );
  });

  test("fails on module.exports when requested", () => {
    expect(() =>
      run("module.exports = createApi;\n", { failOnUnsupported: "true" }),
    ).toThrow(
      "Unsupported CommonJS module.exports in app/controllers/index.js:1.",
    );
  });

  test("accepts jscodeshift dashed fail-on-unsupported option", () => {
    expect(() =>
      run("require('ti.calendar');\n", { "fail-on-unsupported": "true" }),
    ).toThrow(
      "Unsupported CommonJS require() in app/controllers/index.js:1.",
    );
  });

  test("converts inline namespace member calls", () => {
    expect(
      run(
        "require('xp.ui').createNavigationWindow(args);\n",
        {},
        appControllerPath,
      ),
    ).toBe(
      'import * as xpUi from "~/lib/xp.ui";\nxpUi.createNavigationWindow(args);\n',
    );
  });

  test("converts inline default member calls", () => {
    expect(
      run("require('/api').default.postAppLog(message);\n", {}, appControllerPath),
    ).toBe('import api from "~/lib/api";\napi.postAppLog(message);\n');
  });

  test("converts writable inline module properties", () => {
    expect(
      run("require('ti.animation').newRenderingEngineEnabled = true;\n"),
    ).toBe(
      'import tiAnimation from "ti.animation";\ntiAnimation.newRenderingEngineEnabled = true;\n',
    );
  });

  test("hoists nested require declarations", () => {
    expect(
      run(
        "function boot() {\n\tconst ContextSDK = require('ti.contextsdk');\n\tContextSDK.start();\n}\n",
      ),
    ).toBe(
      'import ContextSDK from "ti.contextsdk";\nfunction boot() {\n    ContextSDK.start();\n}\n',
    );
  });

  test("hoists nested assignment requires and keeps assignments", () => {
    expect(
      run(
        "function load() {\n\tglobal.AppsFlyer = require('ti.appsflyer');\n\tcountriesMap = require('json/countries/en.json');\n\tthis.categories = require('json/expense_categories.json');\n}\n",
        {},
        appControllerPath,
      ),
    ).toBe(
      'import tiAppsflyer from "ti.appsflyer";\nimport countriesEnJson from "~/assets/json/countries/en.json";\nimport expenseCategoriesJson from "~/assets/json/expense_categories.json";\nfunction load() {\n\tglobal.AppsFlyer = tiAppsflyer;\n\tcountriesMap = countriesEnJson;\n\tthis.categories = expenseCategoriesJson;\n}\n',
    );
  });

  test("converts top-level assignment requires", () => {
    expect(
      run("global.AvImageview = require('av.imageview');\n"),
    ).toBe(
      'import avImageview from "av.imageview";\nglobal.AvImageview = avImageview;\n',
    );
  });

  test("converts return requires", () => {
    expect(
      run(
        "function countries() {\n\treturn require('json/countries/en.json');\n}\n",
        {},
        appControllerPath,
      ),
    ).toBe(
      'import countriesEnJson from "~/assets/json/countries/en.json";\nfunction countries() {\n\treturn countriesEnJson;\n}\n',
    );
  });

  test("converts require call arguments", () => {
    expect(
      run("shuffle(require('json/discover_categories.json'));\n"),
    ).toBe(
      'import discoverCategoriesJson from "json/discover_categories.json";\nshuffle(discoverCategoriesJson);\n',
    );
  });

  test("converts bounded JSON template requires to eager glob lookups", () => {
    expect(
      run(
        "const countries = require(`json/countries/${locale}.json`);\n",
        {},
        appUtilsPath,
      ),
    ).toBe(
      'const assetsJsonCountriesJsonModules = import.meta.glob("~/assets/json/countries/*.json", {\n  eager: true,\n  import: "default"\n});\n\nconst countries = assetsJsonCountriesJsonModules[`~/assets/json/countries/${locale}.json`];\n',
    );
  });

  test("reuses imports for repeated inline requires", () => {
    expect(
      run(
        "require('xp.ui').createView();\nrequire('xp.ui').createLabel();\n",
        {},
        appControllerPath,
      ),
    ).toBe(
      'import * as xpUi from "~/lib/xp.ui";\nxpUi.createView();\nxpUi.createLabel();\n',
    );
  });

  test("avoids generated binding collisions", () => {
    expect(
      run(
        "const xpUi = createExisting();\nrequire('xp.ui').createView();\n",
        {},
        appControllerPath,
      ),
    ).toBe(
      'import * as xpUiModule from "~/lib/xp.ui";\nconst xpUi = createExisting();\nxpUiModule.createView();\n',
    );
  });

  test("leaves platform conditional requires unchanged", () => {
    expect(
      run("const TiMap = OS_IOS ? require('ti.googlemaps') : require('ti.map');\n"),
    ).toBe(
      "const TiMap = OS_IOS ? require('ti.googlemaps') : require('ti.map');\n",
    );
  });

  test("converts guarded native module requires in shared async functions to dynamic imports", () => {
    expect(
      run(
        "async function ensure() {\n\tif (OS_ANDROID) {\n\t\tconst PlayServices = require('ti.playservices');\n\t\tPlayServices.isAvailable();\n\t}\n}\n",
      ),
    ).toBe(
      'async function ensure() {\n\tif (OS_ANDROID) {\n\t\tconst PlayServices = (await import("ti.playservices")).default;\n\t\tPlayServices.isAvailable();\n\t}\n}\n',
    );
  });

  test("leaves guarded native module requires in shared sync code unchanged", () => {
    expect(
      run(
        "if (OS_ANDROID) {\n\tconst PlayServices = require('ti.playservices');\n\tPlayServices.isAvailable();\n}\n",
      ),
    ).toBe(
      "if (OS_ANDROID) {\n\tconst PlayServices = require('ti.playservices');\n\tPlayServices.isAvailable();\n}\n",
    );
  });

  test("leaves guarded native module requires in nested sync callbacks unchanged", () => {
    expect(
      run(
        "async function ensure() {\n\trequest(() => {\n\t\tif (OS_ANDROID) {\n\t\t\tconst PlayServices = require('ti.playservices');\n\t\t}\n\t});\n}\n",
      ),
    ).toBe(
      "async function ensure() {\n\trequest(() => {\n\t\tif (OS_ANDROID) {\n\t\t\tconst PlayServices = require('ti.playservices');\n\t\t}\n\t});\n}\n",
    );
  });

  test("converts guarded app-local module member requires", () => {
    expect(
      run(
        "if (OS_IOS) {\n\tconst saveButton = require('xp.ui').createActionButton({ title: L('save') });\n}\n",
        {},
        datePickerPath,
      ),
    ).toBe(
      'import * as xpUi from "~/lib/xp.ui";\nif (OS_IOS) {\n\tconst saveButton = xpUi.createActionButton({ title: L(\'save\') });\n}\n',
    );
  });

  test("does not overflow while checking nested guarded native module requires", () => {
    expect(
      run(
        "import { isiOSVersionOrGreater, parseAsLocalDate } from 'app-utils';\nexport default class DatePickerDialog {\n\tconstructor(params = {}) {\n\t\t// Create an 18-years-ago date to go from, which makes the scrolling\n\t\teightteenYearsAgo.setDate(1);\n\t\tif (OS_ANDROID) {\n\t\t\tif (this.type === Ti.UI.PICKER_TYPE_DATE) {\n\t\t\t\tconst calendar = require('ti.calendar');\n\t\t\t}\n\t\t} else if (OS_IOS && this.showAsPicker) {\n\t\t}\n\t}\n}\n",
        {},
        datePickerPath,
      ),
    ).toBe(
      'import { isiOSVersionOrGreater, parseAsLocalDate } from "~/lib/app-utils";\nexport default class DatePickerDialog {\n\tconstructor(params = {}) {\n\t\t// Create an 18-years-ago date to go from, which makes the scrolling\n\t\teightteenYearsAgo.setDate(1);\n\t\tif (OS_ANDROID) {\n\t\t\tif (this.type === Ti.UI.PICKER_TYPE_DATE) {\n\t\t\t\tconst calendar = require(\'ti.calendar\');\n\t\t\t}\n\t\t} else if (OS_IOS && this.showAsPicker) {\n\t\t}\n\t}\n}\n',
    );
  });

  test("converts guarded native module requires in platform-specific code", () => {
    expect(
      run(
        "if (OS_ANDROID) {\n\tconst PlayServices = require('ti.playservices');\n\tPlayServices.isAvailable();\n}\n",
        {},
        "app/lib/android/play-services.js",
      ),
    ).toBe(
      'import PlayServices from "ti.playservices";\nif (OS_ANDROID) {\n    PlayServices.isAvailable();\n}\n',
    );
  });

  test("fails on platform conditional requires when requested", () => {
    expect(() =>
      run(
        "const TiMap = OS_IOS ? require('ti.googlemaps') : require('ti.map');\n",
        { failOnUnsupported: "true" },
      ),
    ).toThrow(
      "Unsupported CommonJS platform conditional require() in app/controllers/index.js:1.",
    );
  });

  test("fails on guarded native module requires in shared code when requested", () => {
    expect(() =>
      run(
        "if (OS_ANDROID) {\n\tconst PlayServices = require('ti.playservices');\n}\n",
        { failOnUnsupported: "true" },
      ),
    ).toThrow(
      "Unsupported CommonJS guarded native module require() in app/controllers/index.js:2.",
    );
  });

  test("does not fail on guarded native module requires in shared async functions", () => {
    expect(
      run(
        "async function ensure() {\n\tif (OS_ANDROID) {\n\t\tconst PlayServices = require('ti.playservices');\n\t}\n}\n",
        { failOnUnsupported: "true" },
      ),
    ).toBe(
      'async function ensure() {\n\tif (OS_ANDROID) {\n\t\tconst PlayServices = (await import("ti.playservices")).default;\n\t}\n}\n',
    );
  });

  test("fails on non-JSON template requires when requested", () => {
    expect(() =>
      run("const module = require(`lib/${name}.js`);\n", {
        failOnUnsupported: "true",
      }),
    ).toThrow(
      "Unsupported CommonJS dynamic require() in app/controllers/index.js:1.",
    );
  });

  test("fails on computed require members when requested", () => {
    expect(() =>
      run("require('xp.ui')[name]();\n", { failOnUnsupported: "true" }),
    ).toThrow(
      "Unsupported CommonJS computed require member in app/controllers/index.js:1.",
    );
  });
});
