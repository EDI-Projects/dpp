/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Pin workspace root to this directory so Turbopack doesn't
    // get confused by the package-lock.json at /home/samay/
    root: __dirname,
  },
}
module.exports = nextConfig
