import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PostHogCaptureClient } from "./posthog-capture-client";

describe("PostHogCaptureClient", () => {
  const roots: string[] = [];

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Local-only build: the transport is disabled at the source. These first
  // three cases are the guard for that -- they fail loudly if
  // LOCAL_ONLY_TELEMETRY_TRANSPORT_DISABLED is ever flipped back to false.
  it("never sends, even with an explicit key and fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    const client = new PostHogCaptureClient({
      apiKey: "test-key",
      fetch: fetchMock,
      now: () => Date.parse("2026-08-05T12:00:00.000Z"),
    });

    expect(client.enabled).toBe(false);
    await client.capture({
      event: "review_command_succeeded",
      distinctId: "install-1",
      properties: { command_path: "info", exit_code: 0, ignored: undefined },
    });
    await client.flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores env overrides for the key and host", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-queue-"));
    roots.push(root);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    const client = PostHogCaptureClient.fromEnv(
      {
        DEV_REVIEW_HOME: root,
        PROGRESSIVE_REVIEW_POSTHOG_KEY: "env-key",
        PROGRESSIVE_REVIEW_POSTHOG_HOST: "https://posthog.example.com/",
      },
      { fetch: fetchMock },
    );

    await client.capture({ event: "event", distinctId: "install-1" });
    await client.flush();

    // Env-supplied key and host no longer produce delivery either.
    expect(client.enabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      (await readdir(root)).filter((file) => file.endsWith(".json")),
    ).toEqual([]);
  });

  it("disables capture when no key is embedded or set in the env", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-queue-"));
    roots.push(root);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    const client = PostHogCaptureClient.fromEnv(
      { DEV_REVIEW_HOME: root },
      { fetch: fetchMock },
    );

    expect(client.enabled).toBe(false);
    await client.capture({ event: "event", distinctId: "install-1" });
    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues nothing, so there is no retry backlog", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "review-queue-"));
    roots.push(root);
    let now = Date.parse("2026-08-05T12:00:00.000Z");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const client = new PostHogCaptureClient({
      apiKey: "test-key",
      fetch: fetchMock,
      queueDir: root,
      now: () => now,
      idFactory: () => "event-1",
    });

    // Nothing reaches the on-disk queue, so there is no retry state to keep.
    await client.capture({ event: "event", distinctId: "install-1" });
    await client.flush();
    expect(
      (await readdir(root)).filter((file) => file.endsWith(".json")),
    ).toEqual([]);

    now += 2_000;
    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();

    await client.capture({ event: "event", distinctId: "install-1" });
    await client.discard();
    expect(
      (await readdir(root)).filter((file) => file.endsWith(".json")),
    ).toEqual([]);
  });

  it("does not send without a key and swallows network errors", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error("network down");
    });
    const disabled = new PostHogCaptureClient({ fetch: fetchMock });
    await disabled.capture({ event: "event", distinctId: "install-1" });
    expect(disabled.enabled).toBe(false);

    const enabled = new PostHogCaptureClient({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    await expect(
      enabled.capture({ event: "event", distinctId: "install-1" }),
    ).resolves.toBeUndefined();
  });
});
