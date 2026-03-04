/** Build script — bundles the frontend with Bun's bundler. */
import { join } from "path";
import { cpSync } from "fs";

const isWatch = process.argv.includes("--watch");

const result = await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  naming: "[name].[ext]",
  minify: !isWatch,
  sourcemap: isWatch ? "linked" : "none",
  target: "browser",
  define: {
    "process.env.NODE_ENV": isWatch ? '"development"' : '"production"',
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Copy public files to dist
cpSync("./public", "./dist", { recursive: true });

console.log(`Build complete: ${result.outputs.length} files written to dist/`);
