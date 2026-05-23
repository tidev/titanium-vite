import path from "path";
import animation from "ti.animation";

export function formatLabelText(value) {
	console.log("[ti-debug] ti.animation =", typeof animation);
	return path.join("label", value);
}
