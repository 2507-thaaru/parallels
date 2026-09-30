import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // Listen on all local IPs so mobile devices can access over LAN
    port: 5173
  }
});
