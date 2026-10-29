#!/usr/bin/env bash
# HAKU SRS RTMP -> HLS smoke test. Opt-in and LOCALHOST ONLY.
# This does not prove WHIP, Safari, 500 real viewers or OVHcloud performance.
set -Eeuo pipefail

if [[ "$(printenv HAKU_SRS_LOCAL_SMOKE || true)" != "YES" ]]; then
  echo "Refusing to start: set HAKU_SRS_LOCAL_SMOKE=YES" >&2
  exit 2
fi
for tool in docker ffmpeg ffprobe curl node; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 2; }
done
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="$ROOT/experiments/ovh-srs-lab/compose.yaml"
# Prevent accidentally using another Docker daemon over SSH/TCP.
if [[ -n "$(printenv DOCKER_HOST || true)" && "$(printenv DOCKER_HOST)" != unix://* ]]; then
  echo "Refusing non-local Docker host" >&2
  exit 2
fi
if [[ -n "$(printenv DOCKER_CONTEXT || true)" && "$(printenv DOCKER_CONTEXT)" != "default" ]]; then
  echo "Refusing non-default Docker context" >&2
  exit 2
fi
PUBLISHER_PID=''
cleanup() {
  if [[ -n "$PUBLISHER_PID" ]]; then
    kill "$PUBLISHER_PID" 2>/dev/null || true
    wait "$PUBLISHER_PID" 2>/dev/null || true
  fi
  docker compose -f "$COMPOSE" -p haku-srs-local-smoke down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker compose -f "$COMPOSE" -p haku-srs-local-smoke up -d
echo "Waiting for SRS localhost RTMP..."
for i in $(seq 1 20); do
  if (echo > /dev/tcp/127.0.0.1/1935) >/dev/null 2>&1; then break; fi
  sleep 1
done
ffmpeg -hide_banner -loglevel error -re \
  -f lavfi -i "testsrc2=size=854x480:rate=24" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 800k -g 48 \
  -c:a aac -b:a 48k -ar 48000 -f flv \
  "rtmp://127.0.0.1:1935/live/haku-lab" >/dev/null 2>&1 &
PUBLISHER_PID=$!
echo "Waiting for HLS playlist..."
for i in $(seq 1 40); do
  if curl --silent --fail --max-time 2 "http://127.0.0.1:8080/live/haku-lab.m3u8" | grep -q '^#EXTINF'; then break; fi
  sleep 1
done
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:8080/live/haku-lab.m3u8" | grep '^#EXTINF'
echo "Inspecting audio/video codecs..."
ffprobe -v error -show_entries stream=codec_name,codec_type \
  -of csv=p=0 "http://127.0.0.1:8080/live/haku-lab.m3u8"
echo "5-viewer local HTTP smoke..."
node "$ROOT/experiments/ovh-srs-lab/hls-local-probe.mjs" \
  --url=http://127.0.0.1:8080/live/haku-lab.m3u8 --viewers=5 --seconds=12
echo "Local RTMP/HLS smoke complete. Not a 500-viewer or WHIP validation."
