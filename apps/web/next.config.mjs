/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Multiple processes/agents edit files in this repo concurrently while the
  // dev server watches them, which has repeatedly corrupted webpack's
  // persistent filesystem cache (dev crashes with "Cannot find module
  // './NNNN.js'" until .next is wiped). Disabling the cache in dev trades
  // some rebuild speed for not needing that manual recovery every time.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
