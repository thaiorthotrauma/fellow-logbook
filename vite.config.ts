import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The commit this bundle was built from, stamped onto every error report the
// app sends to Telegram (src/lib/errorReport.ts). A stale bundle cached inside
// LINE's in-app browser looks exactly like a bug that was already fixed, so
// the build has to travel with the report.
//
// Read from whichever host is building — Vercel, Netlify and GitHub Actions
// each expose the SHA under their own name — then fall back to the local
// checkout, and finally to 'dev' when there is no git at all (a container
// building from a tarball).
function buildSha(): string {
  const fromEnv =
    process.env.VITE_BUILD_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.COMMIT_REF ??
    process.env.GITHUB_SHA
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha()),
  },
})
