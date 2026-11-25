/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Monorepo: il frontend è in frontend/, ma la root del repo è 2 livelli sopra.
  // Imposta outputFileTracingRoot per evitare il warning di lockfile multipli
  // e per limitare il tracing dei file al solo repo root.
  outputFileTracingRoot: path.resolve(__dirname, '../../'),
};
module.exports = nextConfig;
