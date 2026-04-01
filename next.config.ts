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
}

export default nextConfig
