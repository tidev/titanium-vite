/* global WPATH */

const helper = require(WPATH("helper"));
const child = Widget.createController("child", {
	source: "child",
});

const source = $.args.source ?? "unknown";

$.title.text = helper.describeWidget(source);

export function getMessage() {
	return `${helper.describeWidget(source)} with ${child.getMessage()}`;
}
