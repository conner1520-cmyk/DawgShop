import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Dev server only: let a phone on the same network open the app at the
  // Mac's address (e.g. http://172.20.108.133:3000). 172.20.*.* covers the
  // campus network even when the Mac gets a new address.
  allowedDevOrigins: ["172.20.*.*"],
};

export default nextConfig;
