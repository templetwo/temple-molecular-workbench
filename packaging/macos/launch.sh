#!/bin/sh
# Finder starts this short-lived launcher on every opening. The local server
# outlives it, and the server's health handshake reuses an existing workbench.
set -eu
umask 077

launcher_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
resources_dir=$(CDPATH= cd -- "$launcher_dir/../Resources" && pwd -P)
log_dir="${HOME:?}/Library/Logs/Temple Lab"
/bin/mkdir -p "$log_dir"
log_file="$log_dir/launcher.log"
exec >>"$log_file" 2>&1
printf '\n[%s] Opening Temple Lab\n' "$(/bin/date '+%Y-%m-%d %H:%M:%S %Z')"

fail() {
  printf 'Temple Lab could not start: %s\n' "$1"
  /usr/bin/open -a TextEdit "$log_file" >/dev/null 2>&1 || true
  exit 1
}

runtime="$resources_dir/runtime/node"
[ -x "$runtime" ] || fail 'The bundled runtime is missing. Please extract the complete app again.'
[ -f "$resources_dir/serve.mjs" ] || fail 'The local server is missing from this app.'
[ -f "$resources_dir/dist/index.html" ] || fail 'The workbench resources are missing from this app.'
/usr/bin/env -u NODE_OPTIONS -u NODE_PATH "$runtime" --version || fail 'The bundled runtime cannot run on this Mac. Check the architecture in QUICK-START.md.'

ready_dir=$(/usr/bin/mktemp -d "$log_dir/.launch.XXXXXX")
ready_file="$ready_dir/ready.json"
cleanup() {
  # Both paths were created for this one launch; no user data lives here.
  [ ! -f "$ready_file" ] || /bin/rm -f "$ready_file"
  /bin/rmdir "$ready_dir" 2>/dev/null || true
}
trap cleanup EXIT

/usr/bin/nohup /usr/bin/env -u NODE_OPTIONS -u NODE_PATH \
  "$runtime" "$resources_dir/serve.mjs" \
  --root "$resources_dir/dist" --port 5178 --open --ready-file "$ready_file" \
  </dev/null >>"$log_file" 2>&1 &
server_pid=$!

attempt=0
while [ "$attempt" -lt 40 ]; do
  if [ -s "$ready_file" ]; then
    printf 'Temple Lab is ready in your browser.\n'
    exit 0
  fi
  if ! /bin/kill -0 "$server_pid" 2>/dev/null; then
    if wait "$server_pid"; then
      [ ! -s "$ready_file" ] || exit 0
      fail 'The server exited before reporting that it was ready.'
    else
      fail 'The server reported a startup error. Details appear above.'
    fi
  fi
  /bin/sleep 0.2
  attempt=$((attempt + 1))
done

# Stop only the process spawned by this invocation, never a reused server.
/bin/kill -TERM "$server_pid" 2>/dev/null || true
fail 'The local server did not become ready within eight seconds.'
