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
