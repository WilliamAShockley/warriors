import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  serverExternalPackages: ['@libsql/client', '@prisma/adapter-libsql'],
}

export default nextConfig
