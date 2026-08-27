import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // /map scans src/app at request time; make sure the source tree ships
  // with that function on Vercel.
  outputFileTracingIncludes: {
    '/map': ['./src/app/**/*'],
  },
}

export default nextConfig
