const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    if (!isServer) {
      config.resolve.alias.fs = false;
      config.resolve.alias.path = false;
      config.resolve.alias.crypto = false;
    }
    return config;
  },
};
export default nextConfig;
