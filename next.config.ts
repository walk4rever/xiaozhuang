import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/miao',
        destination: '/du',
        permanent: true,
      },
      {
        source: '/api/miao/:path*',
        destination: '/api/du/:path*',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    // Dev-only: the deployed relay's CORS allowlist only permits the
    // production origin, so a browser on localhost gets "Failed to fetch".
    // Proxy same-origin in dev so the browser never needs relay CORS.
    // No-op in production — the app still calls the relay directly there.
    if (process.env.NODE_ENV === 'production') return []
    return [
      {
        source: '/__dev-llm-proxy',
        destination: 'https://relay.air7.fun/llm',
      },
    ]
  },
}

export default nextConfig
