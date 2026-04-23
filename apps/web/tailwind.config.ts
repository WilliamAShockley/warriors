import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        offwhite: '#F7F6F3',
      },
    },
  },
  plugins: [],
}

export default config
