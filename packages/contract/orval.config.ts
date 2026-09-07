import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: "./openapi.yaml",
    output: {
      target: "./generated/client.ts",
      client: "react-query",
      httpClient: "fetch",
      mode: "single",
      override: {
        mutator: {
          path: "./src/http-client.ts",
          name: "apiFetch",
        },
      },
    },
  },
  apiZod: {
    input: "./openapi.yaml",
    output: {
      target: "./generated/zod.ts",
      client: "zod",
      mode: "single",
    },
  },
});
