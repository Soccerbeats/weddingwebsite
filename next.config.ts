import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /*
   * Hosts allowed to load dev-server assets cross-origin.
   *
   * `next dev` serves its chunks and its HMR socket only to origins it trusts,
   * and since Next 16.3 it *enforces* that rather than warning. The dev stack in
   * docker/ is browsed by the server's LAN address, not localhost — and without
   * this the pages still render while every chunk 403s, so the site loads and
   * then does nothing: forms submit as plain GETs, no button works. It fails in
   * the one way that does not look like a configuration error.
   *
   * Development only; `next start` ignores it.
   */
  allowedDevOrigins: ["10.0.0.253", "10.0.0.188", "localhost", "127.0.0.1"],
  images: {
    // Next 16 locks the optimizer to quality 75 by default; allow the low
    // quality used for the lightbox's instant placeholder layer.
    qualities: [50, 75],
  },
};

export default nextConfig;
