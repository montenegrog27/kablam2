// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {
//   transpilePackages: ["@kablam/supabase"],
//   reactCompiler: false,
// };

// export default nextConfig;

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@kablam/supabase"],
  turbopack: {
    root: path.join(__dirname, "../../"),
    resolveAlias: {
      "@kablam/supabase": path.join(
        __dirname,
        "../../packages/supabase/client.ts"
      ),
    },
  },
};

export default nextConfig;