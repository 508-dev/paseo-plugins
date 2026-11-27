#!/usr/bin/env bash
set -euo pipefail
umask 077
here=$(cd "$(dirname "$0")" && pwd)
preview=false
if [[ ${1:-} == --preview ]]; then preview=true; shift; fi
binary=${1:-$(command -v iron-proxy || true)}
if "$preview"; then exec node "$here/setup.mjs" preview "$binary"; fi
node "$here/setup.mjs" check "$binary"
binary=$(realpath -- "$binary")
scratch=$(mktemp -d)
name="paseo-ironproxy-${scratch##*.}"
cleanup() {
  docker rm -f "$name" "$name-client" >/dev/null 2>&1 || true
  rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
mkdir "$scratch/fixture" "$scratch/transport"
"$binary" generate-ca -outdir "$scratch/fixture" -expiry-hours 1 >/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout "$scratch/fixture/origin.key" \
  -out "$scratch/fixture/origin.crt" 2>/dev/null
image=node@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d
opts=(--network none --read-only --cap-drop ALL --security-opt no-new-privileges
  --user "$(id -u):$(id -g)" --pids-limit 64 --memory 256m)
docker run -d --name "$name" "${opts[@]}" \
  --sysctl net.ipv4.ip_unprivileged_port_start=0 \
  -v "$binary:/iron-proxy:ro" -v "$scratch/fixture:/fixture:ro" \
  -v "$here/policy.yaml:/policy.yaml:ro" -v "$here/supervisor.mjs:/supervisor.mjs:ro" \
  -v "$scratch/transport:/transport" "$image" node /supervisor.mjs >/dev/null
run_client() {
  timeout 30 docker run --rm --name "$name-client" "${opts[@]}" \
    -v "$here/credential.json:/credential.json:ro" -v "$here/workload.mjs:/workload.mjs:ro" -v "$scratch/transport:/transport:ro" \
    -v "$scratch/fixture/ca.crt:/ca.crt:ro" "$image" node /workload.mjs "$@"
}
run_client
docker stop --timeout 1 "$name" >/dev/null
run_client proxy-offline
