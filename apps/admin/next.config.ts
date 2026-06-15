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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },
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
