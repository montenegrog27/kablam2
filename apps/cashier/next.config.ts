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
  reactCompiler: false,
  turbopack: {
    root: path.join(__dirname, "../../"),
  },
};

export default nextConfig;