import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/umiutsuroi/",
  plugins: [react()],
  build: {
    target: "es2022",
  },
});
