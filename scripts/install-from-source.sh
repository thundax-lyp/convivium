#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
plugin_root="$repository_root/plugin"
temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/convivium-source-install.XXXXXX")
trap 'rm -rf "$temporary_root"' EXIT HUP INT TERM

cd "$repository_root"
pnpm --dir "$plugin_root" install --frozen-lockfile
pnpm --dir "$plugin_root" build
pack_result=$(pnpm --dir "$plugin_root" pack --json --pack-destination "$temporary_root")
packed_name=$(printf '%s' "$pack_result" | node -e '
let text = "";
process.stdin.on("data", (chunk) => (text += chunk));
process.stdin.on("end", () => {
    const value = JSON.parse(text);
    const entry = Array.isArray(value) ? value[0] : value;
    if (!entry || typeof entry.filename !== "string") process.exit(1);
    process.stdout.write(entry.filename);
});')

CONVIVIUM_INSTALL_ROOT=${CONVIVIUM_INSTALL_ROOT:-"$repository_root/dsh-workspace/convivium-user"}
export CONVIVIUM_INSTALL_ROOT
"$plugin_root/scripts/install.sh" --artifact "$temporary_root/$(basename -- "$packed_name")" "$@"
