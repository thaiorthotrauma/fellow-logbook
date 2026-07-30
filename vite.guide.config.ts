// Vite config for the tutorial-guide screenshot harness only (see
// .guide-harness/). Swaps @line/liff and @supabase/supabase-js for local
// stubs so the real UI renders with sample data and no backend.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  root: here('./.guide-harness'),
  plugins: [react()],
  resolve: {
    alias: {
      '@line/liff': here('./.guide-harness/stubs/liff.ts'),
      '@supabase/supabase-js': here('./.guide-harness/stubs/supabase.ts'),
    },
  },
  define: {
    'import.meta.env.VITE_LIFF_ID': JSON.stringify('0000000000-harness'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://harness.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('harness-anon-key'),
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify('harness'),
  },
  server: { port: 5199, strictPort: true },
})
