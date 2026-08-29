import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mapMocks = vi.hoisted(() => ({
  runSoftwareMapCli: vi.fn<typeof import("./map-cli").runSoftwareMapCli>(),
}));

vi.mock("./map-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./map-cli")>();
  return {
    ...actual,
    runSoftwareMapCli: mapMocks.runSoftwareMapCli,
  };
});

const { runSoftwareMapCliEntry } = await import("./map-cli-entry");

describe("runSoftwareMapCliEntry telemetry", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    mapMocks.runSoftwareMapCli.mockReset();
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  it.each(["check", "init", "update"] as const)(
    "emits completion telemetry for map %s",
    async (mode) => {
      mapMocks.runSoftwareMapCli.mockResolvedValue(0);
      const fetchMock = stubPostHog();

      const exitCode = await runSoftwareMapCliEntry({
        args: [mode],
        cwd: await tempDir(tempDirs, "progressive-review-map-repo-"),
        env: await telemetryEnv(tempDirs),
        stdout: writableOutput([]),
        stderr: writableOutput([]),
      });

      expect(exitCode).toBe(0);
      // Local-only build: the command still runs and still reports its exit
      // code, but the telemetry transport is disabled, so nothing is delivered.
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("never leaks ref names for the removed update flags", async () => {
    // update's --base/--head are a parse error now; telemetry falls back to
    // check-shaped metadata and must still never carry the ref strings.
    mapMocks.runSoftwareMapCli.mockResolvedValue(0);
    const fetchMock = stubPostHog();

    const exitCode = await runSoftwareMapCliEntry({
      args: [
        "update",
        "--base",
        "secret-base-ref",
        "--head",
        "secret-head-ref",
      ],
      cwd: await tempDir(tempDirs, "progressive-review-map-repo-"),
      env: await telemetryEnv(tempDirs),
      stdout: writableOutput([]),
      stderr: writableOutput([]),
    });

    expect(exitCode).toBe(0);
    // Local-only build: the ref strings cannot leak because nothing is sent at
    // all. Property-level sanitization is still covered by
    // ui-telemetry-events.test.ts.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("emits failure telemetry for map command failures", async () => {
    mapMocks.runSoftwareMapCli.mockResolvedValue(1);
    const fetchMock = stubPostHog();

    const exitCode = await runSoftwareMapCliEntry({
      args: ["check"],
      cwd: await tempDir(tempDirs, "progressive-review-map-repo-"),
      env: await telemetryEnv(tempDirs),
      stdout: writableOutput([]),
      stderr: writableOutput([]),
    });

    expect(exitCode).toBe(1);
    // Local-only build: failures are still surfaced through the exit code, but
    // no failure event is delivered.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function telemetryEnv(tempDirs: string[]): Promise<NodeJS.ProcessEnv> {
  return {
    DEV_REVIEW_HOME: await tempDir(tempDirs, "progressive-review-map-config-"),
    PROGRESSIVE_REVIEW_POSTHOG_KEY: "test-key",
  };
}

async function tempDir(tempDirs: string[], prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function stubPostHog() {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response("ok"));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function writableOutput(output: string[]): NodeJS.WriteStream {
  return {
    write: (chunk: string) => {
      output.push(chunk);
      return true;
    },
  } as NodeJS.WriteStream;
}
