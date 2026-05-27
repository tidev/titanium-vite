import { formatLabelText } from "../lib/app-utils";
import { Model as BookModel } from "/alloy/models/Book";

const book = new BookModel({
	title: "Titanium Vite",
	chapterCount: 3,
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

function doClick() {
	formatLabelText($.label.text);
	alert($.label.text);
}

$.modelLabel.text = formatBookSummary(book);
console.log(`[alloy-esm] book summary: ${$.modelLabel.text}`);
void loadDynamicController().catch((error) => {
	console.log("[alloy-esm] dynamic import failed", error);
});
console.log("[alloy-esm] index opened");
$.index.open();
