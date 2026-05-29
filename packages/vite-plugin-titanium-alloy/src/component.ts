import { cleanUrl, stripBase } from '@titanium-sdk/vite-utils';
import path from 'path';
import qs from 'querystring';
import fs from 'fs-extra';
import type { ResolvedId } from 'rolldown';
import type { EnvironmentModuleNode, Plugin, ResolvedConfig } from 'vite';
import { createFilter } from 'vite';

import { assertNoLegacyCommonJsExport } from './commonjs-exports.js';
import type { AlloyContext } from './context.js';

const controllerRE =
	/(?:[/\\]widgets[/\\]([^/\\]+))?[/\\](?:controllers)[/\\](.*)/;
const EMPTY_EXPORT = 'export default {}';
const VIEW_ONLY_PREFIX = '\0alloyview:';
const INTEROP_HELPER_ID = 'virtual:titanium/alloy-interop';
const RESOLVED_INTEROP_HELPER_ID = `\0${INTEROP_HELPER_ID}`;
const INTEROP_HELPER_IMPORT =
	'import { __alloyViteGetInteropProperty } from "virtual:titanium/alloy-interop";';
const WIDGET_IMPORT_CONTROLLER_RUNTIME_IMPORT =
	'import __alloyViteCreateWidget from "/alloy/widget";';
const generatedNamespaceImportRE =
	/^import \* as ([A-Za-z_$][\w$]*) from ['"]([^'"]+)['"];$/gm;
const INTEROP_HELPER_CODE = `export function __alloyViteGetInteropProperty(moduleValue, propertyName) {
\tif (moduleValue == null) return undefined;
\tconst direct = moduleValue[propertyName];
\tif (direct !== undefined) return direct;
\tconst defaultValue = moduleValue.default;
\tif (defaultValue == null || defaultValue === moduleValue) return undefined;
\treturn defaultValue[propertyName];
}
`;

interface AlloyQuery {
	alloy?: boolean;
	type?: 'template' | 'style';
}

function parseAlloyRequest(id: string) {
	const [filename, rawQuery] = id.split('?', 2);
	const query = qs.parse(rawQuery  ?? '') as AlloyQuery;

	if (query.alloy != null) {
		query.alloy = true;
	}
	return {
		filename,
		query
	};
}

export function patchModuleFactoryInterop(code: string): string {
	let patched = code;
	let didPatch = false;
	for (const binding of collectNamespaceBindings(code)) {
		const factoryRE = new RegExp(
			`\\b${escapeRegExp(binding)}\\.(create[A-Za-z0-9_$]+)(\\s*\\|\\|)`,
			'g'
		);
		if (!factoryRE.test(patched)) {
			continue;
		}
		factoryRE.lastIndex = 0;
		didPatch = true;
		patched = patched.replace(
			factoryRE,
			(_match, factoryName: string, fallbackOperator: string) =>
				`__alloyViteGetInteropProperty(${binding}, "${factoryName}")${fallbackOperator}`
		);
	}
	if (!didPatch) return code;
	if (patched.includes(INTEROP_HELPER_IMPORT)) return patched;
	return `${INTEROP_HELPER_IMPORT}\n${patched}`;
}

export function patchWidgetImportControllerRuntime(
	code: string,
	widgetId: string | undefined
): string {
	if (!widgetId || !code.includes('Widget.importController')) return code;
	if (code.includes(WIDGET_IMPORT_CONTROLLER_RUNTIME_IMPORT)) return code;
	if (/\b(?:const|let|var)\s+Widget\b/.test(code)) return code;
	return [
		WIDGET_IMPORT_CONTROLLER_RUNTIME_IMPORT,
		`const Widget = new __alloyViteCreateWidget(${JSON.stringify(widgetId)});`,
		code
	].join('\n');
}

function collectNamespaceBindings(code: string): string[] {
	const bindings = new Set<string>();
	let match = generatedNamespaceImportRE.exec(code);
	while (match) {
		const binding = match[1];
		if (binding) {
			bindings.add(binding);
		}
		match = generatedNamespaceImportRE.exec(code);
	}
	return [...bindings];
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function componentPlugin(ctx: AlloyContext): Plugin {
	const { appDir } = ctx;
	let config: ResolvedConfig;
	const filter = createFilter(controllerRE, /controllers\/BaseController/);

	return {
		name: 'titanium:alloy:component',

		configResolved(_config) {
			config = _config;
		},

		async resolveId(id, importer) {
			if (id === INTEROP_HELPER_ID) {
				return RESOLVED_INTEROP_HELPER_ID;
			}

			// serve sub-part requests (*?alloy) as virtual modules
			if (parseAlloyRequest(id).query.alloy) {
				return id;
			}

			const componentMatch = controllerRE.exec(id);
			const [, widgetId, componentId] = componentMatch ?? [];
			if (!componentId) return;

			let result: ResolvedId | null;
			if (widgetId) {
				result = await this.resolve(
					path.join(appDir, 'widgets', widgetId, 'controllers', componentId),
					importer,
					{ skipSelf: true }
				);
			} else {
				result = await this.resolve(
					path.join(appDir, 'controllers', componentId),
					importer,
					{ skipSelf: true }
				);
				if (!result) {
					// No controller found, but maybe there is a view only
					const view = await this.resolve(
						path.join(appDir, 'views', `${componentId}.xml`),
						importer,
						{ skipSelf: true }
					);
					if (view) {
						return (
							VIEW_ONLY_PREFIX +
							view.id
								.replace('/app/views/', '/app/controllers/')
								.replace(/\.xml$/, '.js')
						);
					}
				}
			}
			if (result) {
				return result.id;
			}
		},

		load(id) {
			if (id === RESOLVED_INTEROP_HELPER_ID) {
				return INTEROP_HELPER_CODE;
			}

			if (id.startsWith(VIEW_ONLY_PREFIX)) {
				return '';
			}

			const { filename, query } = parseAlloyRequest(id);
			// select corresponding block for sub-part virtual modules
			if (query.alloy) {
				console.log('alloy sub-part load', filename, query);
				if (query.type === 'template') {
					throw new Error(
						'Alloy template sub-part loading not implemented yet.'
					);
				}
			}

			return null;
		},

		async transform(code, id) {
			if (id.startsWith(VIEW_ONLY_PREFIX)) {
				// Map virtual view only id back to controller id
				id = id.replace(VIEW_ONLY_PREFIX, '');
			}

			const { filename, query } = parseAlloyRequest(id);
			if (!query.alloy && !filter(filename)) {
				return;
			}

			const cleanId = cleanUrl(id);
			const componentMatch = controllerRE.exec(cleanId);
			const widgetId = componentMatch?.[1];

			if (!query.alloy) {
				assertNoLegacyCommonJsExport(code, cleanId, 'controller');
				ctx.compiler.purgeStyleCache(cleanId);
				const {
					code: controllerCode,
					map,
					dependencies
				} = ctx.compiler.compileComponent({
					controllerContent: code,
					file: cleanId
				});

				const deps = dependencies
					// Only consider deps that actually exist
					.filter((d: string) => fs.pathExistsSync(d))
					.map((dep: string) => {
						// Make sure changes to view and style files trigger a controller rebuild
						this.addWatchFile(dep);

						if (dep.endsWith('.tss')) {
							return dep + '?alloy&type=style';
						} else if (dep.endsWith('.xml')) {
							return dep + '?alloy&type=template';
						} else {
							throw new Error(`Unknown Alloy component dependency: ${dep}`);
						}
					});

				// server only handling for view and style dependency hmr; in
				// production builds `this.environment` has no moduleGraph.
				if ('moduleGraph' in this.environment) {
					const { moduleGraph } = this.environment;
					const thisModule = moduleGraph.getModuleById(id);
					if (thisModule) {
						// record deps in the module graph so edits to view and style can trigger
						// controller import to hot update
						const depModules = new Set<string | EnvironmentModuleNode>();
						const devBase = config.base;
						for (const file of deps) {
							depModules.add(
								await moduleGraph.ensureEntryFromUrl(
									stripBase(file, (config.server.origin ?? '') + devBase),
									false
								)
							);
						}

						await moduleGraph.updateModuleInfo(
							thisModule,
							depModules,
							null,
							new Set(),
							null,
							false,
						);
					}
				}

				return {
					code: patchWidgetImportControllerRuntime(
						patchModuleFactoryInterop(controllerCode),
						widgetId
					),
					map
				};
			} else if (query.type === 'template' || query.type === 'style') {
				return { code: EMPTY_EXPORT };
			}
		}
	};
}
