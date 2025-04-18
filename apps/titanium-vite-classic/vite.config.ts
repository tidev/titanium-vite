import { defineConfig } from "vite";
import { titanium } from "vite-plugin-titanium";

export default defineConfig({
  plugins: [titanium({ projectType: "classic" })],
});
