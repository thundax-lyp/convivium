#!/bin/sh

set -eu

DSH_VERSION="0.1.2-rc.1"

fail() {
    printf 'convivium-start: %s\n' "$*" >&2
    exit 1
}

install_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
release_file="$install_root/release"
environment_file="$install_root/dev.env"
workspace_path_file="$install_root/workspace-path"
[ -f "$release_file" ] || fail "installed release marker not found: $release_file"
[ -f "$environment_file" ] || fail "environment file not found: $environment_file"
[ -f "$workspace_path_file" ] || fail "DSH workspace path not found: $workspace_path_file"

release_version=$(sed -n '1p' "$release_file")
case "$release_version" in
    "" | *[!0-9A-Za-z.+-]*) fail "installed release marker is invalid" ;;
esac

release_root="$install_root/releases/$release_version"
roles_root="$release_root/package/meeting-roles"
workspace_root=$(sed -n '1p' "$workspace_path_file")
case "$workspace_root" in
    /*) ;;
    *) fail "saved DSH workspace path is invalid" ;;
esac
[ -f "$roles_root/cordis.patch.yml" ] || fail "installed meeting role resources are missing"
[ -f "$install_root/storage.patch.yml" ] || fail "storage configuration is missing"
[ -d "$workspace_root" ] || fail "DSH workspace is missing: $workspace_root"

set -a
. "$environment_file"
set +a
[ -n "${DEEPSEEK_API_KEY:-}" ] || fail "DEEPSEEK_API_KEY is empty in $environment_file"

export DSH_HOME="$install_root/dsh-home"
export CONVIVIUM_MEETING_ROLES_ROOT="$roles_root"
cd "$workspace_root"
exec pnpm dlx "@deepseek-ai/dsh@$DSH_VERSION" web \
    --patch "$install_root/storage.patch.yml" \
    --patch "$roles_root/cordis.patch.yml" \
    --host 127.0.0.1 \
    --port 31828 \
    --trusted-host 127.0.0.1:31828
