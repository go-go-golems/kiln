# @kiln/server

The Kiln server (guide §30): records, devices and CUDA jobs over HTTP, SQLite storage, server-sent events, and the
built workbench page with a session token. Node 26 runs the TypeScript directly; there is no build step.

```bash
pnpm dev                                  # build the workbench, then serve it on http://127.0.0.1:5280/
pnpm serve                                # serve the last build
pnpm --filter @kiln/server test           # Vitest: in-memory SQLite, the fake runner, no GPU, no SSH
```

| Variable         | Default                     | Effect                                    |
| ---------------- | --------------------------- | ----------------------------------------- |
| `KILN_PORT`      | `5280`                      | HTTP port, loopback only                  |
| `KILN_DATA_DIR`  | `apps/server/.data`         | `kiln.sqlite`, executor profiles          |
| `KILN_DIST`      | `apps/workbench/dist`       | The page (`kiln-workbench.html`)          |
| `KILN_EXECUTORS` | `$KILN_DATA_DIR/executors.json` | CUDA executor profiles; none if missing |
| `KILN_MODEL`     | unset                       | Model id for the agent gateway; unset turns it off |
| `KILN_MODEL_URL` | `https://api.anthropic.com/v1/messages` | The Messages endpoint the gateway calls |
| `ANTHROPIC_API_KEY` | unset                    | Sent upstream as `x-api-key`; never logged, stored or returned |

Relative paths resolve against `apps/server` (where `pnpm --filter` runs the server); prefer absolute ones.

An executor profile runs `runner/kiln_runner.py` on this machine or on a GPU host through `ssh -T` (the runner is
copied once to `runnerDir`, named by its SHA-256):

```json
{ "executors": [
  { "id": "local-cuda", "target": "local", "python": "python3", "env": { "KILN_ARCH": "native" } },
  { "id": "rtx-dev", "target": "ssh", "host": "playback@playback-rtx-dev", "runnerDir": "~/.cache/kiln-runner" }
] }
```

The server probes every executor at start-up; an SSH executor therefore connects to its host as soon as the server
starts. Every request is checked first: the Host must be this loopback address and port (403 `bad_host`), an Origin
must be this server (403 `bad_origin`), and a request other than GET needs the page's `X-Kiln-Token` (403
`bad_token`) and a JSON body (415). The page-side client is `apps/workbench/src/server-client.js`.

The agent gateway (guide §31): when `KILN_MODEL` and `ANTHROPIC_API_KEY` are both set, `POST /api/agent/sample`
relays the workbench agent's model calls and streams the answer back as NDJSON (`text` events, then one `done` or
`error`), and `GET /api/agent/usage` reports token totals by model and by conversation. Every upstream call writes one
`llm_calls` row, whatever its outcome. The page uses the gateway when it is served here without a host bridge
(`window.claude`). The gateway has no upstream timeout and no concurrency cap; a stuck model call holds its request
until the page stops it.
