import { formatLabelText } from "../lib/app-utils";
import "../lib/slow-start.js";

const book = Alloy.createModel("Book", {
	title: "Titanium Vite",
	chapterCount: 3,
});
const authoredWidget = Alloy.createWidget("com.titanium.esmWidget", {
	source: "authored",
});
const dynamicControllerName = "hello";

function formatBookSummary(model) {
	return `${model.get("title")} model: ${model.get("chapterCount")} chapters`;
}

async function loadDynamicController() {
	const literalModule = await import("./dynamic/hello.js");
	const LiteralController = literalModule.default ?? literalModule;
	const literalController = new LiteralController({
		source: "literal",
	});
	console.log(
		`[alloy-esm] dynamic hello loaded: ${literalController.getMessage()}`,
	);

	const dynamicModule = await import(`./dynamic/${dynamicControllerName}.js`);
	const DynamicController = dynamicModule.default ?? dynamicModule;
	const dynamicController = new DynamicController({
		source: "variable",
	});
	console.log(
		`[alloy-esm] dynamic hello loaded: ${dynamicController.getMessage()}`,
	);
}

async function loadImportControllerProbe() {
	const appController = await Alloy.importController("dynamic/hello", {
		source: "Alloy.importController",
	});
	console.log(
		`[alloy-import-controller] app helper: ${appController.getMessage()}`,
	);

	const widgetChildMessage = await authoredWidget.getImportedChildMessage();
	console.log(
		`[alloy-import-controller] widget helper: ${widgetChildMessage}`,
	);
}

function doClick() {
	formatLabelText($.label.text);
	alert($.label.text);
}

async function openDetailsWindow() {
	const detailsController = await Alloy.importController("details");
	detailsController.getView().open();
}

function openDetails() {
	void openDetailsWindow().catch((error) => {
		console.log("[alloy-navigation] details open failed", error);
	});
}

function runNativeRequireProbe() {
	console.log("[alloy-esm-repro] before require('ti.polyfill')");
	const TiPolyfillViaRequire = require("ti.polyfill");
	console.log(
		`[alloy-esm-repro] after require('ti.polyfill'): createActionButton=${typeof TiPolyfillViaRequire.createActionButton}`,
	);
	console.log("[alloy-esm-repro] before require-path createActionButton()");
	const button = TiPolyfillViaRequire.createActionButton({
		title: "Native require button",
		width: 260,
		height: 48,
	});
	console.log("[alloy-esm-repro] after require-path createActionButton()");
	$.index.add(button);
}

$.modelLabel.text = formatBookSummary(book);
console.log(`[alloy-esm] book summary: ${$.modelLabel.text}`);
console.log(`[alloy-esm] authored widget: ${authoredWidget.getMessage()}`);
console.log(`[alloy-esm] xml widget: ${$.xmlWidget.getMessage()}`);
runNativeRequireProbe();
void loadDynamicController().catch((error) => {
	console.log("[alloy-esm] dynamic import failed", error);
});
void loadImportControllerProbe().catch((error) => {
	console.log("[alloy-import-controller] helper probe failed", error);
});
console.log("[alloy-esm] index opened");
$.index.open();
