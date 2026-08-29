// Local-only build: disabled.
//
// This script used to overwrite src/embedded-posthog-key.ts with a real PostHog
// project key so release builds shipped telemetry enabled. The transport itself
// is now disabled in src/posthog-capture-client.ts, and embedding a key is not
// something a local-only build should ever do -- so this refuses to run rather
// than silently producing a build that looks instrumented but is not.
console.error(
  "embed-posthog-key: disabled in this build. Telemetry is local-only; no PostHog key is embedded.",
);
process.exit(1);
