import { formatLabelText } from "../lib/app-utils";

const book = Alloy.createModel("Book", {
	title: "Titanium Vite",
	chapterCount: 3,
});

function formatBookSummary(model) {
	return `${model.get("title")} model: ${model.get("chapterCount")} chapters`;
}

function doClick() {
	formatLabelText($.label.text);
	alert($.label.text);
}

$.modelLabel.text = formatBookSummary(book);
$.index.open();
