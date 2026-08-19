/** @type {import('next').NextConfig} */

// Content-Security-Policy for the Privy auth surface. Shipped as REPORT-ONLY
// first: it never blocks, only reports violations to the browser console, so it
// can't break the app before we've verified the allowlist against the live Privy
// modal/iframe. Flip the header name to "Content-Security-Policy" to enforce
// once the console is clean (see migrations/plan notes).
const csp = [
  "default-src 'self'",
  // Next.js injects inline/eval'd bootstrap; Privy + Cloudflare Turnstile load scripts.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://auth.privy.io https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.privy.io https://*.walletconnect.com https://explorer-api.walletconnect.com",
  // Privy auth API + RPC, and WalletConnect relays for external wallets.
  "connect-src 'self' https://auth.privy.io https://*.privy.io https://*.rpc.privy.systems https://explorer-api.walletconnect.com https://*.walletconnect.com https://*.walletconnect.org wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org",
  // The Privy login modal + Turnstile + WalletConnect verify render in iframes.
  "frame-src 'self' https://auth.privy.io https://challenges.cloudflare.com https://verify.walletconnect.com https://verify.walletconnect.org",
  "child-src 'self' https://auth.privy.io https://challenges.cloudflare.com https://verify.walletconnect.com https://verify.walletconnect.org",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // Privy's client SDK statically imports the OPTIONAL peer dep
  // `@farcaster/mini-app-solana` (Farcaster mini-app + Solana support). We use
  // only email/social/EVM-wallet login plus an embedded USDC-on-Base wallet — no
  // Farcaster, no Solana — so stub it to an empty module. Without this the
  // production build fails with "Module not found: Can't resolve
  // '@farcaster/mini-app-solana'". The SDK reaches it only behind a runtime
  // capability check, so resolving it to nothing is safe and keeps Solana deps
  // out of the bundle.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy-Report-Only", value: csp }],
      },
    ];
  },
};

export default nextConfig;
