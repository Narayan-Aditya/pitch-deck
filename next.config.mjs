/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  // The creator content library is read from disk at request time, so it has
  // to be traced into the serverless bundle or the route finds nothing once
  // deployed.
  outputFileTracingIncludes: {
    '/api/creator-matches': ['./nitin josi data/**'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
