import type { Config } from "prettier"

export default {
  // prettier options
  plugins: ["prettier-plugin-jsdoc"],
  experimentalTernaries: true,
  proseWrap: "always",
  semi: false,
  trailingComma: "all",

  // jsdoc options
  jsdocPreferCodeFences: true,
  tsdoc: true,
} satisfies Config
