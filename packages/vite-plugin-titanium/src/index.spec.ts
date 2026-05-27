import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createBuilder, createServer } from "vite";
import type { Plugin, PluginOption } from "vite";
import { expect, test, vi } from "vitest";

import { titanium } from "./index.js";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../..",
);

test("allows Alloy app modules to import Titanium-supported builtins in dev", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const server = await createServer({
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
		server: { middlewareMode: true },
	});

	try {
		const environment = server.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}

		const result = await environment.fetchModule(
			path.join(appRoot, "app/lib/app-utils.js"),
			path.join(appRoot, "app/controllers/index.js"),
		);

		if (!("code" in result)) {
			throw new Error("Expected transformed module code");
		}

		expect(result.code).toContain("formatLabelText");
	} finally {
		await server.close();
		process.chdir(previousCwd);
	}
});

test("does not duplicate plugins in the Titanium dev environment", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const server = await createServer({
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
		server: { middlewareMode: true },
	});

	try {
		const environment = server.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}

		const modelPluginCount = environment.config.plugins.filter(
			(plugin) => plugin.name === "titanium:alloy:model",
		).length;

		expect(modelPluginCount).toBe(1);
	} finally {
		await server.close();
		process.chdir(previousCwd);
	}
});

test("externalizes declared Titanium native modules in dev module runner fetches", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [
					{ id: "ti.animation", platform: "ios", version: "6.1.1" },
				],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const server = await createServer({
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
		server: { middlewareMode: true },
	});

	try {
		const environment = server.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}

		const result = await environment.fetchModule(
			"ti.animation",
			path.join(appRoot, "app/lib/app-utils.js"),
		);

		expect(result).toEqual({
			externalize: "ti.animation",
			type: "builtin",
		});
	} finally {
		await server.close();
		process.chdir(previousCwd);
	}
});

test("keeps non-native external dependencies on Vite's fetch path", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-classic");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const externalDependencyPlugin: Plugin = {
		name: "test:external-dependency",
		enforce: "pre",
		resolveId(id) {
			if (id === "is-odd") {
				return { id, external: true };
			}
		},
	};
	const server = await createServer({
		configFile: false,
		logLevel: "silent",
		plugins: [
			bridgePlugin,
			externalDependencyPlugin,
			titanium({ projectType: "classic" }),
		],
		root: appRoot,
		server: { middlewareMode: true },
	});

	try {
		const environment = server.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}

		const result = await environment.fetchModule(
			"is-odd",
			path.join(appRoot, "src/app.js"),
		);

		if (!("externalize" in result)) {
			throw new Error("Expected Vite to externalize dependency resolution");
		}

		expect(result.externalize).not.toBe("is-odd");
		expect(result.externalize).toMatch(/^file:/);
		expect(result.type).toBe("commonjs");
	} finally {
		await server.close();
		process.chdir(previousCwd);
	}
});

test("uses Vite environment builtin resolution instead of a Titanium node-builtins resolver", async () => {
	const pluginNames = await collectPluginNames(titanium({ projectType: "classic" }));

	expect(pluginNames).not.toContain("titanium:node-builtins");
});

test("prebundles Alloy dependencies with Titanium global require semantics", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const server = await createServer({
		cacheDir: path.join(tmpdir(), `titanium-vite-test-${Date.now()}`),
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
		server: { middlewareMode: true },
	});

	try {
		const environment = server.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}

		const alloyResult = await environment.fetchModule(
			"alloy",
			path.join(appRoot, "app/alloy.js"),
		);
		if (!("code" in alloyResult) || !("id" in alloyResult)) {
			throw new Error("Expected optimized Alloy dependency code");
		}

		expect(alloyResult.id).toContain("/deps_titanium/");
		expect(alloyResult.code).not.toContain("node:module");
		expect(alloyResult.code).not.toContain("createRequire");
	} finally {
		await server.close();
		process.chdir(previousCwd);
	}
});

test("prebundles Titanium-style Alloy runtime paths in dev", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const server = await createServer({
		cacheDir: path.join(tmpdir(), `titanium-vite-test-${Date.now()}`),
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
		server: { middlewareMode: true },
	});

	try {
		const environment = server.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}

		const runtimeIds = [
			"/alloy",
			"/alloy/backbone",
			"/alloy/controllers/BaseController",
			"/alloy/sync/properties",
			"/alloy/underscore",
		];

		for (const runtimeId of runtimeIds) {
			const result = await environment.fetchModule(
				runtimeId,
				path.join(appRoot, "app/alloy.js"),
			);
			if (!("id" in result)) {
				throw new Error(`Expected optimized module result for ${runtimeId}`);
			}

			expect(result.id).toContain("/deps_titanium/");
			expect(result.id).not.toContain("/node_modules/alloy/");
		}
	} finally {
		await server.close();
		process.chdir(previousCwd);
	}
});

test("limits forced serve build to the Titanium module runner bootstrap", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "serve",
				deployType: "development",
				devServer: { origin: "http://127.0.0.1:5173" },
				nativeModules: [],
				platform: "ios",
				target: "simulator",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const builder = await createBuilder({
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
	});

	try {
		const environment = builder.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}
		const input = environment.config.build.rollupOptions.input;

		expect(input).toEqual({
			"module-runner": "virtual:titanium/module-runner",
		});
	} finally {
		process.chdir(previousCwd);
	}
});

test("keeps app graph entries for Titanium production builds", async () => {
	const appRoot = path.join(repoRoot, "apps/titanium-vite-alloy");
	const previousCwd = process.cwd();
	process.chdir(appRoot);

	const bridgePlugin = {
		name: "ti-vite-bridge",
		api: {
			context: {
				command: "build",
				deployType: "production",
				nativeModules: [],
				platform: "ios",
				target: "dist-appstore",
			},
			reportTiApiUsage: vi.fn(),
		},
	};
	const builder = await createBuilder({
		configFile: false,
		logLevel: "silent",
		plugins: [bridgePlugin, titanium({ projectType: "alloy" })],
		root: appRoot,
	});

	try {
		const environment = builder.environments.titanium;
		if (!environment) {
			throw new Error("Titanium environment missing");
		}
		const input = environment.config.build.rollupOptions.input;

		expect(input).toEqual(
			expect.objectContaining({
				"module-runner": "virtual:titanium/module-runner",
				main: "virtual:titanium/main",
			}),
		);
		expectInputRecord(input);
		expect(Object.keys(input)).toContain("alloy/controllers/index");
	} finally {
		process.chdir(previousCwd);
	}
});

async function collectPluginNames(
	pluginOptions: readonly PluginOption[],
): Promise<string[]> {
	const names: string[] = [];

	for (const pluginOption of pluginOptions) {
		const resolvedPluginOption = await pluginOption;
		if (!resolvedPluginOption) {
			continue;
		}
		if (Array.isArray(resolvedPluginOption)) {
			names.push(...(await collectPluginNames(resolvedPluginOption)));
			continue;
		}
		names.push(resolvedPluginOption.name);
	}

	return names;
}

function expectInputRecord(value: unknown): asserts value is Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Expected build input to be an object");
	}
}
