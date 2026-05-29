console.log("[alloy-esm-repro] delaying index import");

setTimeout(() => {
	console.log("[alloy-esm-repro] index import delay complete");

	console.log("[alloy-esm-repro] before require('ti.polyfill')");
	const TiPolyfillViaRequire = require("ti.polyfill");
	console.log(
		`[alloy-esm-repro] after require('ti.polyfill'): createActionButton=${typeof TiPolyfillViaRequire.createActionButton}`,
	);
	console.log("[alloy-esm-repro] before require-path createActionButton()");
	TiPolyfillViaRequire.createActionButton({
		title: "Native require button",
		width: 260,
		height: 48,
	});
	console.log("[alloy-esm-repro] after require-path createActionButton()");
}, 1000);
