import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ledgerhq/device-management-kit", "@ledgerhq/device-signer-kit-ethereum", "@ledgerhq/device-transport-kit-node-hid", "node-hid", "usb"],
};

export default nextConfig;
