import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const owner = process.env.GITHUB_REPOSITORY_OWNER ?? ''
const isUserSite = repository.toLowerCase() === `${owner}.github.io`.toLowerCase()
const githubPagesBase =
  process.env.GITHUB_ACTIONS === 'true' ? (isUserSite ? '/' : `/${repository}/`) : '/'

// https://vite.dev/config/
export default defineConfig({
  base: githubPagesBase,
  plugins: [react()],
})
