import { defineConfig } from "vite";
import { titanium } from "@titanium-sdk/vite-plugin-titanium";

export default defineConfig({
  plugins: [titanium({ projectType: "alloy" })],
});
