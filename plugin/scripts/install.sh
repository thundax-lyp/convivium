#!/bin/sh

set -eu

DSH_VERSION="0.1.2-rc.1"
PACKAGE_NAME="@convivium/dsh-plugin"

fail() {
    printf 'convivium-install: %s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

absolute_path() {
    path_dir=$(dirname -- "$1")
    path_name=$(basename -- "$1")
    (CDPATH= cd -- "$path_dir" && printf '%s/%s\n' "$PWD" "$path_name")
}

script_path=$0
while [ -L "$script_path" ]; do
    link_dir=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)
    link_target=$(readlink "$script_path")
    case "$link_target" in
        /*) script_path=$link_target ;;
        *) script_path="$link_dir/$link_target" ;;
    esac
done
script_dir=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)
package_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
artifact_path=""
workspace_input=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --artifact)
            [ -z "$artifact_path" ] || fail "--artifact may only be specified once"
            [ "$#" -ge 2 ] || fail "--artifact requires a tarball"
            artifact_path=$(absolute_path "$2")
            shift 2
            ;;
        --workspace)
            [ -z "$workspace_input" ] || fail "--workspace may only be specified once"
            [ "$#" -ge 2 ] || fail "--workspace requires a path"
            workspace_input=$2
            shift 2
            ;;
        *) fail "usage: install.sh [--workspace <path>] [--artifact <tarball>]" ;;
    esac
done

require_command node
require_command pnpm
require_command tar

temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/convivium-install.XXXXXX")
trap 'rm -rf "$temporary_root"' EXIT HUP INT TERM

if [ -z "$artifact_path" ]; then
    require_command npm
    pack_result=$(npm pack "$package_root" --json --pack-destination "$temporary_root")
    packed_name=$(printf '%s' "$pack_result" | node -e '
let text = "";
process.stdin.on("data", (chunk) => (text += chunk));
process.stdin.on("end", () => {
    const value = JSON.parse(text);
    const entry = Array.isArray(value) ? value[0] : value;
    if (!entry || typeof entry.filename !== "string") process.exit(1);
    process.stdout.write(entry.filename);
});')
    artifact_path="$temporary_root/$(basename -- "$packed_name")"
fi

[ -f "$artifact_path" ] || fail "artifact not found: $artifact_path"
mkdir -p "$temporary_root/inspect"
tar -xzf "$artifact_path" -C "$temporary_root/inspect"
manifest="$temporary_root/inspect/package/package.json"
roles_patch="$temporary_root/inspect/package/meeting-roles/cordis.patch.yml"
start_script="$temporary_root/inspect/package/scripts/start.sh"
[ -f "$manifest" ] || fail "artifact is missing package/package.json"
[ -f "$roles_patch" ] || fail "artifact is missing meeting role resources"
[ -f "$start_script" ] || fail "artifact is missing scripts/start.sh"

manifest_values=$(node -e '
const manifest = require(process.argv[1]);
if (manifest.name !== "@convivium/dsh-plugin") process.exit(1);
if (typeof manifest.version !== "string" || !/^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(manifest.version)) process.exit(1);
process.stdout.write(`${manifest.name}\n${manifest.version}\n`);
' "$manifest") || fail "artifact manifest is not a valid $PACKAGE_NAME release"
release_version=$(printf '%s\n' "$manifest_values" | sed -n '2p')
[ -n "$release_version" ] || fail "artifact version is empty"

install_root=${CONVIVIUM_INSTALL_ROOT:-"$PWD/dsh-workspace/convivium-user"}
mkdir -p "$install_root"
install_root=$(CDPATH= cd -- "$install_root" && pwd)
chmod 700 "$install_root"
artifact_root="$install_root/artifacts"
release_root="$install_root/releases/$release_version"
installed_artifact="$artifact_root/$(basename -- "$artifact_path")"
workspace_path_file="$install_root/workspace-path"
[ ! -e "$release_root" ] || fail "release already exists: $release_root"
[ ! -e "$installed_artifact" ] || fail "artifact already exists: $installed_artifact"

if [ -n "$workspace_input" ]; then
    workspace_root=$(node -e 'const path = require("node:path"); process.stdout.write(path.resolve(process.argv[1]))' "$workspace_input")
elif [ -f "$workspace_path_file" ]; then
    workspace_root=$(sed -n '1p' "$workspace_path_file")
    case "$workspace_root" in
        /*) ;;
        *) fail "saved DSH workspace path is invalid: $workspace_path_file" ;;
    esac
else
    workspace_root="$PWD/dsh-workspace"
fi

mkdir -p "$artifact_root" "$install_root/releases" "$install_root/dsh-home" "$workspace_root"
cp "$artifact_path" "$installed_artifact"
mkdir "$release_root"
tar -xzf "$installed_artifact" -C "$release_root"

if [ ! -e "$install_root/storage.patch.yml" ]; then
    storage_path=$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$install_root/convivium-storage.sqlite")
    cat >"$install_root/storage.patch.yml" <<EOF
- insert:
    - id: convivium-user-storage-sqlite
      name: "@deepseek-ai/dsh-storage-sqlite"
      config:
        path: $storage_path
        journalMode: wal
- id: storage-domain
  config:
    backend: sqlite
    routes:
      workspace: json
      session_projcache: json
      message_feedback: json
EOF
fi

if [ ! -e "$install_root/dev.env" ]; then
    (umask 077 && printf 'DEEPSEEK_API_KEY=\n' >"$install_root/dev.env")
fi

export DSH_HOME="$install_root/dsh-home"
pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" plugin --profile web add "$installed_artifact"
pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" plugin --profile web add \
    "@deepseek-ai/dsh-storage-sqlite@$DSH_VERSION"

cp "$release_root/package/scripts/start.sh" "$install_root/start.sh"
chmod 755 "$install_root/start.sh"
printf '%s\n' "$workspace_root" >"$workspace_path_file"
printf '%s\n' "$release_version" >"$install_root/release"

printf 'Installed %s %s in %s\n' "$PACKAGE_NAME" "$release_version" "$install_root"
printf 'Set DEEPSEEK_API_KEY in %s/dev.env, then run %s/start.sh\n' "$install_root" "$install_root"
