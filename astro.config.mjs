// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server', // IMPORTANT → active le SSR
  adapter: node({
    mode: 'standalone', // Produit un entry.mjs autonome pour PM2
  }),
  
  vite: {
    plugins: [tailwindcss()],
  },
});
