# Launch Temple Lab

## One click on your Mac

Unzip `Temple-Lab-macOS-arm64.zip`, open the **Temple Lab** folder, and double-click **Temple Lab.app**. The simulator opens in your default browser. Opening the app again reuses the running local workbench. The current bundle supports Apple Silicon Macs with macOS 11 or later and includes its own Node runtime; you do not need to install Node, npm, or dependencies.

The bundled simulator runs offline. Its optional source-reference links lead to external websites. The app starts a small background server on your Mac's loopback interface; closing the browser tab does not terminate that server. Startup details are recorded in `~/Library/Logs/Temple Lab/launcher.log`.

The app is assembled locally and is not Developer ID signed or notarized. A separately downloaded copy may be subject to macOS security checks. For rebuilding, runtime licensing, and archive details, see [the macOS build guide](../packaging/macos/BUILD.md).

## Local server for source checkouts

`scripts/serve.mjs` serves the already-built workbench using Node's standard library. It needs Node.js 18 or later and no npm packages. Project development and rebuilding still use the Node.js version specified in `package.json`.

```sh
node scripts/serve.mjs --open
```

The default site root is `dist/` beside the repository's `scripts/` directory. It is resolved relative to the server file, so the caller's working directory does not matter. A packaged launcher can pass its own absolute site root:

```sh
node /path/to/serve.mjs --root /path/to/dist --port 5178 --open
```

The server binds to `127.0.0.1`. `--open` asks the operating system to open the browser only after the server is listening or an existing workbench has been identified. Without `--open`, copy the printed URL into a browser. If automatic opening fails, the local server remains available at that URL.

If the requested port is occupied, the launcher checks `/__temple_health`. It reuses a healthy server whose JSON response has the exact app identifier `temple-molecular-workbench` and matching app version; the second launcher process then exits normally. An unrelated service, older version, moved or missing build directory, or unresponsive endpoint causes a new server to use a free ephemeral port. Its URL is printed and used for the browser. Pass `--port 0` to request an ephemeral port directly.

Keep a terminal-launched server running while using the workbench; press Ctrl+C to stop it. Packaged launchers can terminate their own server process with SIGTERM. Reused servers belong to the earlier launch.

Packaged launchers can pass `--ready-file PATH` to receive an atomic JSON readiness record before the browser opens. The record contains `url`, `reused`, and `pid`. A newly started server reports its process ID; a reused server reports `pid: null`. The parent directory must already exist. A readiness-file write failure stops a newly created server and exits with an error.

The server handles GET and HEAD for the build's supported static asset types and `index.html`. It does not list directories, serve source maps, or fall back to source files. Traversal paths and symlinks escaping the selected root are rejected. The health response contains only the app identifier and version.

The exported `createWorkbenchServer({ root })` returns a validated, unbound HTTP server. `startWorkbenchServer({ root, port, open })` returns `{ server, url, reused }`; `server` is `null` when an existing process is reused. Run the server regression checks with:

```sh
node --test tests/launcher.test.mjs
```
