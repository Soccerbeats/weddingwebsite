import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // Next 16 locks the optimizer to quality 75 by default; allow the low
    // quality used for the lightbox's instant placeholder layer.
    qualities: [50, 75],
  },
};

export default nextConfig;
