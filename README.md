<div align="center">
  <img
    src="docs/assets/review-logo.png"
    width="96"
    alt="Review logo"
  />
  <h1>Review</h1>
  <p><strong>Cursor for code review.</strong></p>
</div>

Review is a desktop app for understanding and reviewing agent-written code. It
turns a branch or pull request into a guided, interactive review connected to
the exact code behind it: explore architecture and data flow, inspect diffs, ask
questions, and read coding-agent traces from one interface.

This is a **local-only build**. Telemetry, bug-report uploads, remote trace
storage, and auto-update are removed — see [Local-only](#local-only) below.

<p align="center">
  <img
    src="docs/assets/review-overview.png"
    width="880"
    alt="Review Desktop showing a guided code review and interactive sequence diagram"
  />
</p>

## Build and install

macOS on Apple silicon. Requires **Node.js 24** and **pnpm 11** (`node -v`
should print `v24.x`; the repo pins it in `.nvmrc`).

```sh
pnpm install && pnpm desktop:package:macos \
  && sudo rm -rf /Applications/Review.app && sudo mv apps/review-desktop/VSCode-darwin-arm64/Review.app /Applications/ \
  && printf '%s\n' '#!/bin/sh' 'APP=/Applications/Review.app/Contents' '[ -x "$APP/MacOS/Review" ] || { echo "Review is not installed in /Applications." >&2; exit 1; }' 'export ELECTRON_RUN_AS_NODE=1' 'exec "$APP/MacOS/Review" "$APP/Resources/app/review-runtime/dist/cli.js" "$@"' | sudo sh -c 'cat > /usr/local/bin/review && chmod 755 /usr/local/bin/review'
```

Three steps: build, install to `/Applications`, put `review` on your `PATH`.
Then open **Review** from Applications, and run `review --help` in a terminal.

The `review` shim runs the CLI inside the bundle using the app's own Electron
binary as Node, so the CLI needs no system Node.js — only the build does.
Re-running the command rewrites both, so neither goes stale.

The first build takes a while and **needs network access** — it installs npm
dependencies, downloads Electron and Node headers, and fetches the curated
language extensions from Open VSX (each pinned to an exact version and verified
against a SHA-256 before install). Later builds reuse the cache. This is
build-time only; the app itself makes no outbound connections.

`sudo` leaves the installed bundle owned by root. That is fine for a shared
machine, and it means removing it later also needs `sudo`.

## Develop

Build and launch without packaging:

```sh
pnpm install
pnpm dev
```

`pnpm desktop:watch` recompiles incrementally. Run `pnpm run ci` before opening
a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[desktop prerequisites](apps/review-desktop/README.md#prerequisites).

For Linux: `pnpm desktop:package:linux` → `apps/review-desktop/VSCode-linux-x64/`.

## Local-only

Nothing leaves the machine. The following were disabled in this fork; search the
source for `LOCAL_ONLY_` to find the guards.

| Removed | Was |
| --- | --- |
| PostHog analytics | Usage events, on by default in official builds |
| Bug reports | Uploaded review source, diffs, and a screenshot — and ignored the telemetry opt-out |
| Remote trace storage | Uploaded raw agent transcripts and git author email to R2 |
| Automatic git hook rewriting | Silently repointed `core.hooksPath` in every repo an agent touched |
| Third-party installer | Piped a remote shell script into `bash` |
| Auto-update | Hourly contact with an update server |

`product.json` carries no `updateUrl`, so the updater disables itself
permanently rather than relying on a setting. Packaging fails if one is
reintroduced.

Because updates are off, **patching is manual**: watch for Electron and Chromium
advisories, rebuild, and reinstall with the command above.

Native OS policy enforcement (Group Policy / managed plists) is inert in this
fork — `@vscode/policy-watcher` is not installed, so `nativePolicyService`
silently applies no managed settings.

## Documentation

[How Review works](docs/how-review-works.md) · [Coding agents](docs/agents.md) ·
[CLI](docs/cli-reference.md) · [Troubleshooting](docs/troubleshooting.md)

`docs/privacy.md` and `docs/telemetry.md` describe the upstream design and are
annotated to note that those transports are disabled here.

## Known limitations

- Review is built around reviewing changes to one repo. Your coding agent can
  pull context from other repos on your machine, but architectural changes are
  not mapped across repos.
- Stacked PRs are not handled properly yet.
- Sharing reviews between machines is awkward.

## A note on vendoring Code OSS

We vendor Code OSS rather than maintaining patches, because coding agents have a
hard time with patches and there is a lot of stock VS Code we don't need. See
[`apps/review-desktop/UPSTREAM`](apps/review-desktop/UPSTREAM) for the fork's
provenance and divergence inventory.

## License

Review is available under the [MIT License](LICENSE). The vendored Code - OSS
fork retains Microsoft's MIT license and third-party notices; see
[`apps/review-desktop/LICENSE`](apps/review-desktop/LICENSE) and
[`apps/review-desktop/UPSTREAM`](apps/review-desktop/UPSTREAM).
