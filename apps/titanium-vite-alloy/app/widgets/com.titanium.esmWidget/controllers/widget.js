import { describeWidget } from "/alloy/widgets/com.titanium.esmWidget/lib/helper";

const child = Widget.createController("child", {
	source: "child",
});

const source = $.args.source ?? "unknown";

$.title.text = describeWidget(source);

export function getMessage() {
	return `${describeWidget(source)} with ${child.getMessage()}`;
}

export async function getImportedChildMessage() {
	const importedChild = await Widget.importController("child", {
		source: "importController",
	});
	return importedChild.getMessage();
}
