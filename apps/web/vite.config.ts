import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.NODE_ENV': JSON.stringify(mode),
        'import.meta.env.VITE_API_ENDPOINT': JSON.stringify(env.VITE_API_ENDPOINT || process.env.VITE_API_ENDPOINT), // Force replacement
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        lib: {
          entry: path.resolve(__dirname, 'widget.tsx'),
          name: 'ChatbotWidget',
          fileName: (format) => `widget.js`,
          formats: ['umd']
        },
        rollupOptions: {
           output: {
             // Ensure CSS is extracted to a single file named style.css
             assetFileNames: (assetInfo) => {
               if (assetInfo.name && assetInfo.name.endsWith('.css')) return 'style.css';
               return assetInfo.name as string;
             }
           }
        }
      }
    };
});
