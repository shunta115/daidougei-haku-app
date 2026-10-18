#!/bin/sh
set -eu

archive=${1:-}
checksums=${2:-}

if [ -z "$archive" ] || [ -z "$checksums" ]; then
  echo "usage: $0 <custom-archive.dump> <SHA256SUMS>" >&2
  exit 64
fi

if [ ! -s "$archive" ] || [ ! -s "$checksums" ]; then
  echo "backup archive or checksum file is empty" >&2
  exit 65
fi

archive_dir=$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd)
checksum_name=$(basename -- "$checksums")
archive_name=$(basename -- "$archive")

(cd "$archive_dir" && shasum -a 256 -c "$checksum_name")

list_file=$(mktemp)
schema_file=$(mktemp)
trap 'rm -f "$list_file" "$schema_file"' EXIT HUP INT TERM

pg_restore --list "$archive" > "$list_file"
pg_restore --schema-only --file "$schema_file" "$archive"

grep -q 'TABLE DATA' "$list_file"
grep -Eq 'FUNCTION|PROCEDURE' "$list_file"
grep -q 'TRIGGER' "$list_file"
grep -q 'POLICY' "$list_file"
grep -q 'ROW SECURITY' "$list_file"
grep -Eq 'ACL|GRANT|REVOKE' "$schema_file"

echo "backup verification passed: $archive_name"
