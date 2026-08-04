import type { NextConfig } from "next";

/**
 * Firebase values that must exist when the bundle is built.
 *
 * `NEXT_PUBLIC_*` variables are inlined at build time, not read at runtime, so
 * a deploy that builds without them produces a bundle with no Firebase config
 * in it at all. The site then serves a clean 200 and dies in the browser, which
 * is a miserable thing to debug. Failing the build instead turns a silently
 * broken deploy into a build log that names the missing variable.
 */
const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

const missing = REQUIRED.filter((name) => !process.env[name]);

// Only enforced for production builds: tooling that loads this config without
// an environment should not blow up.
if (missing.length > 0 && process.env.NODE_ENV === "production") {
  throw new Error(
    `Firebase config missing at build time: ${missing.join(", ")}.\n` +
      "Set these in the host's environment variables (Netlify: Site settings > " +
      "Environment variables), then trigger a fresh deploy. Adding them without " +
      "rebuilding changes nothing, because the values are baked into the bundle.",
  );
}

const nextConfig: NextConfig = {};

export default nextConfig;
