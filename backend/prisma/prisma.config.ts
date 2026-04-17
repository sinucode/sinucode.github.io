import { defineConfig } from '@prisma/client';

export default defineConfig({
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL,
    // Si usas directUrl, puedes agregarlo aquí
    // directUrl: process.env.DIRECT_URL,
  },
});
