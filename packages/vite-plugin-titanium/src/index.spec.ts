import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { PluginOption } from "vite";
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
		if (!("code" in alloyResult)) {
			throw new Error("Expected optimized Alloy module import code");
		}

		const optimizedDependencyId = /__vite_ssr_import__\("([^"]+)"/.exec(
			alloyResult.code,
		)?.[1];
		if (!optimizedDependencyId) {
			throw new Error("Expected optimized Alloy dependency import");
		}

		const optimizedResult = await environment.fetchModule(
			optimizedDependencyId,
			path.join(appRoot, "app/alloy.js"),
		);
		if (!("code" in optimizedResult)) {
			throw new Error("Expected optimized Alloy dependency code");
		}

		expect(optimizedResult.code).not.toContain("node:module");
		expect(optimizedResult.code).not.toContain("createRequire");
		expect(optimizedResult.code).toContain('typeof require !== "undefined"');
	} finally {
		await server.close();
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
