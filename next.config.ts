import type { NextConfig } from "next";
import path from "path";

// Pin tracing + Turbopack to this repo so a parent `package-lock.json` (e.g. on Desktop) is not treated as the workspace root.
// Always run `npm run build` / `npm run dev` from the project directory.
const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
