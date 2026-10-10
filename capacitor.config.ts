import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.rdesley.casasdeoracao",
  appName: "Casas de Oração",
  webDir: "out",
  backgroundColor: "#f7f8f6",
  android: {
    allowMixedContent: false,
  },
};

export default config;
