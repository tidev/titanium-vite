import { defineConfig } from "vite";
import { titanium } from "vite-plugin-titanium";
import { createTitaniumEnvironment } from "vite-titanium-environment";

export default defineConfig({
  appType: "custom",
  plugins: [titanium({ projectType: "classic" })],
  environments: {
    titanium: createTitaniumEnvironment({}),
  },
  builder: {
    buildApp: async (builder) => {
      // Vite comes with client and ssr environemnts by default which we don't need,
      // so we only build the titanium environment
      await builder.build(builder.environments.titanium);
    },
  },
});
