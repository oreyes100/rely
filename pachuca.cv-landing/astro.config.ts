import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import node from '@astrojs/node'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://www.pachuca.vc',
  srcDir: 'app',
  output: 'server',
  integrations: [sitemap()],
  adapter: node({
    mode: 'standalone',
  }),
  i18n: {
    locales: ['es', 'en'],
    defaultLocale: 'en',
    routing: {
      redirectToDefaultLocale: true,
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
