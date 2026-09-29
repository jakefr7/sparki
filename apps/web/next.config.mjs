/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'development' ? (process.env.SPARKI_WEB_DIST_DIR || '.next-dev') : '.next',
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
