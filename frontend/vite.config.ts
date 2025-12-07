import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path'; // צריך בשביל resolve alias

export default defineConfig({
   plugins: [react(), tailwindcss()],
   resolve: {
      alias: {
         '@': path.resolve(__dirname, 'src'), // כאן מגדירים את @
      },
   },
   server: {
      port: 5173,
      proxy: {
         '/askAI': {
            target: 'http://localhost:3000',
            changeOrigin: true,
            secure: false,
         },
      },
   },
});
