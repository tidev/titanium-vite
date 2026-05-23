import { formatLabelText } from "../lib/app-utils";

function doClick(e) {
	formatLabelText($.label.text);
	alert($.label.text);
}

$.index.open();
