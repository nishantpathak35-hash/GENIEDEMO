/**
 * Next.js configuration.
 *
 * **Deliberately almost empty, and that is the point.**
 *
 * The legacy config carries a `webpack()` function stubbing `node:fs`,
 * `node:http`, `node:stream` and `node:zlib` to `false` on the client, because
 * `jspdf` and `html2pdf.js` drag Node built-ins into the browser bundle. Those
 * stubs are why the project runs `next dev --webpack` despite a `turbopack`
 * block sitting directly above them (STACK-MIGRATION defect 4).
 *
 * Client-side PDF generation is the root cause. It moved to the Typst worker in
 * `services/worker` (ADR-0013), so the polyfill block is gone and Turbopack is
 * on — `dev` in package.json uses it.
 *
 * `typescript.ignoreBuildErrors` is also absent, deliberately. The legacy sets
 * it to true, which is why its 29 TypeScript files give no build guarantee.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  // The API is reached over HTTP. Apps never link service code — enforced by
  // the `{ target: './apps', from: './services' }` zone in eslint.config.mjs.
  env: {
    NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000',
  },
};

export default nextConfig;
