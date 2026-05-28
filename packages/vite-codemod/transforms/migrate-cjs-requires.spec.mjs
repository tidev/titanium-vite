import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const jscodeshift = require("jscodeshift");
const transform = require("./migrate-cjs-requires.cjs");

function run(source, options = {}, path = "app/controllers/index.js") {
  return transform(
    { path, source },
    { jscodeshift },
    options,
  );
}

describe("migrate-cjs-requires", () => {
  test("converts top-level static require declarations to namespace imports", () => {
    expect(run("const XP = require('xp.ui');\nXP.createView();\n")).toBe(
      'import * as XP from "xp.ui";\nXP.createView();\n',
    );
  });

  test("converts static JSON require declarations to default imports", () => {
    expect(
      run("const countries = require('json/countries/en.json');\ncountries.DE;\n"),
    ).toBe(
      'import countries from "json/countries/en.json";\ncountries.DE;\n',
    );
  });

  test("converts default member requires to default imports", () => {
    expect(run("const Api = require('/api').default;\nApi.fetch();\n")).toBe(
      'import Api from "/api";\nApi.fetch();\n',
    );
  });

  test("converts named member requires to named imports", () => {
    expect(
      run("const createButton = require('xp.ui').createActionButton;\n"),
    ).toBe('import { createActionButton as createButton } from "xp.ui";\n');
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
      'import * as tiCalendar from "ti.calendar";\nfunction load() {\n\treturn tiCalendar;\n}\n',
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
      run("require('xp.ui').createNavigationWindow(args);\n"),
    ).toBe(
      'import * as xpUi from "xp.ui";\nxpUi.createNavigationWindow(args);\n',
    );
  });

  test("converts inline default member calls", () => {
    expect(
      run("require('/api').default.postAppLog(message);\n"),
    ).toBe('import api from "/api";\napi.postAppLog(message);\n');
  });

  test("converts writable inline module properties", () => {
    expect(
      run("require('ti.animation').newRenderingEngineEnabled = true;\n"),
    ).toBe(
      'import * as tiAnimation from "ti.animation";\ntiAnimation.newRenderingEngineEnabled = true;\n',
    );
  });

  test("hoists nested require declarations", () => {
    expect(
      run(
        "function boot() {\n\tconst ContextSDK = require('ti.contextsdk');\n\tContextSDK.start();\n}\n",
      ),
    ).toBe(
      'import * as ContextSDK from "ti.contextsdk";\nfunction boot() {\n    ContextSDK.start();\n}\n',
    );
  });

  test("hoists nested assignment requires and keeps assignments", () => {
    expect(
      run(
        "function load() {\n\tglobal.AppsFlyer = require('ti.appsflyer');\n\tcountriesMap = require('json/countries/en.json');\n\tthis.categories = require('json/expense_categories.json');\n}\n",
      ),
    ).toBe(
      'import * as tiAppsflyer from "ti.appsflyer";\nimport countriesEnJson from "json/countries/en.json";\nimport expenseCategoriesJson from "json/expense_categories.json";\nfunction load() {\n\tglobal.AppsFlyer = tiAppsflyer;\n\tcountriesMap = countriesEnJson;\n\tthis.categories = expenseCategoriesJson;\n}\n',
    );
  });

  test("converts top-level assignment requires", () => {
    expect(
      run("global.AvImageview = require('av.imageview');\n"),
    ).toBe(
      'import * as avImageview from "av.imageview";\nglobal.AvImageview = avImageview;\n',
    );
  });

  test("converts return requires", () => {
    expect(
      run("function countries() {\n\treturn require('json/countries/en.json');\n}\n"),
    ).toBe(
      'import countriesEnJson from "json/countries/en.json";\nfunction countries() {\n\treturn countriesEnJson;\n}\n',
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
      run("const countries = require(`json/countries/${locale}.json`);\n"),
    ).toBe(
      'const jsonCountriesJsonModules = import.meta.glob("json/countries/*.json", {\n  eager: true,\n  import: "default"\n});\n\nconst countries = jsonCountriesJsonModules[`json/countries/${locale}.json`];\n',
    );
  });

  test("reuses imports for repeated inline requires", () => {
    expect(
      run("require('xp.ui').createView();\nrequire('xp.ui').createLabel();\n"),
    ).toBe(
      'import * as xpUi from "xp.ui";\nxpUi.createView();\nxpUi.createLabel();\n',
    );
  });

  test("avoids generated binding collisions", () => {
    expect(
      run("const xpUi = createExisting();\nrequire('xp.ui').createView();\n"),
    ).toBe(
      'import * as xpUiModule from "xp.ui";\nconst xpUi = createExisting();\nxpUiModule.createView();\n',
    );
  });

  test("leaves platform conditional requires unchanged", () => {
    expect(
      run("const TiMap = OS_IOS ? require('ti.googlemaps') : require('ti.map');\n"),
    ).toBe(
      "const TiMap = OS_IOS ? require('ti.googlemaps') : require('ti.map');\n",
    );
  });

  test("leaves guarded native module requires in shared code unchanged", () => {
    expect(
      run(
        "if (OS_ANDROID) {\n\tconst PlayServices = require('ti.playservices');\n\tPlayServices.isAvailable();\n}\n",
      ),
    ).toBe(
      "if (OS_ANDROID) {\n\tconst PlayServices = require('ti.playservices');\n\tPlayServices.isAvailable();\n}\n",
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
      'import * as PlayServices from "ti.playservices";\nif (OS_ANDROID) {\n    PlayServices.isAvailable();\n}\n',
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
