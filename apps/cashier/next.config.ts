import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kablam/supabase"],
  reactCompiler: false,
};

export default nextConfig;
