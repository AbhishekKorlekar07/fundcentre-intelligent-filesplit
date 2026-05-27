/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-lib', 'jszip', 'xlsx'],
  },
};

module.exports = nextConfig;
