import type { NextConfig } from "next";
import { isIPv4 } from "node:net";

const mobilePreviewHost = process.env.CMS_MOBILE_PREVIEW_HOST;

const nextConfig: NextConfig = {
  allowedDevOrigins: mobilePreviewHost && isIPv4(mobilePreviewHost) ? [mobilePreviewHost] : undefined,
};

export default nextConfig;
