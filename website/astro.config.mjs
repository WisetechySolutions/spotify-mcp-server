import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://playmcp.dev',
  output: 'static',
  integrations: [sitemap()],
});
