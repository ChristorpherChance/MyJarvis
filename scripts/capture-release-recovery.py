"""Private full-tree release snapshots and isolated restore checks. Never installs or rolls back live data."""
import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PureWindowsPath

SCHEMA = 1
MAX_FILES = 1000000
MAX_MANIFEST = 128 * 1024 * 1024
CHUNK = 1024 * 1024
RELEASE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")
HASH = re.compile(r"^[a-f0-9]{64}$")


class RecoveryError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise RecoveryError(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded_json(value):
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("utf-8")


def signature(info):
    return [info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns]


def absolute(path):
    require(isinstance(path, (str, Path)) and Path(path).is_absolute(), "ABSOLUTE_PATH_REQUIRED")
    return Path(os.path.abspath(path))


def inside(path, parent):
    left, right = os.path.normcase(str(path)), os.path.normcase(str(parent))
    return left == right or left.startswith(right + os.sep)


def no_links(path):
    path = absolute(path)
    for item in [*reversed(path.parents), path]:
        info = item.lstat()
        require(not stat.S_ISLNK(info.st_mode) and not getattr(item, "is_junction", lambda: False)(), "LINK_REFUSED")
    require(os.path.normcase(str(path.resolve(strict=True))) == os.path.normcase(str(path)), "REDIRECTED_PATH_REFUSED")
    return path


def windows_private(path, secure=False, tree=False):
    # The path travels through a private process environment, never through script interpolation or output.
    code = r"""
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
$taskPath=$env:JARVIS_RECOVERY_PRIVATE_PATH
$taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$taskSystem=New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
if ($env:JARVIS_RECOVERY_SECURE -eq '1') {
 $taskAcl=[IO.Directory]::GetAccessControl($taskPath)
 $taskAcl.SetAccessRuleProtection($true,$false)
 foreach($taskRule in @($taskAcl.Access)){[void]$taskAcl.RemoveAccessRuleSpecific($taskRule)}
 $taskAcl.SetOwner($taskSid)
 $taskInheritance=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
 foreach($taskIdentity in @($taskSid,$taskSystem)) {
  $taskRule=New-Object Security.AccessControl.FileSystemAccessRule($taskIdentity,'FullControl',$taskInheritance,'None','Allow')
  $taskAcl.AddAccessRule($taskRule)
 }
 [IO.Directory]::SetAccessControl($taskPath,$taskAcl)
}
$taskItems=@($taskPath)
if ($env:JARVIS_RECOVERY_TREE -eq '1') {$taskItems+=@([IO.Directory]::EnumerateFileSystemEntries($taskPath,'*',[IO.SearchOption]::AllDirectories))}
foreach($taskItem in $taskItems) {
 if(([IO.File]::GetAttributes($taskItem) -band [IO.FileAttributes]::Directory) -ne 0){$taskAcl=[IO.Directory]::GetAccessControl($taskItem)}else{$taskAcl=[IO.File]::GetAccessControl($taskItem)}
 if($taskAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $taskSid.Value){throw 'PRIVATE_OWNER_INVALID'}
 $taskSeen=@{}
 foreach($taskRule in $taskAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
  $taskIdentity=$taskRule.IdentityReference.Value
  if($taskIdentity -notin @($taskSid.Value,'S-1-5-18') -or $taskRule.AccessControlType -ne 'Allow'){throw 'PRIVATE_ACL_INVALID'}
  $taskSeen[$taskIdentity]=$true
 }
 if(-not $taskSeen.ContainsKey($taskSid.Value)){throw 'PRIVATE_ACL_MISSING'}
}
"""
    env = dict(os.environ, JARVIS_RECOVERY_PRIVATE_PATH=str(path), JARVIS_RECOVERY_SECURE="1" if secure else "0",
               JARVIS_RECOVERY_TREE="1" if tree else "0")
    result = subprocess.run(["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
                             base64.b64encode(code.encode("utf-16le")).decode("ascii")],
                            env=env, capture_output=True, timeout=60, check=False)
    require(result.returncode == 0, "PRIVATE_WINDOWS_ACL_INVALID")


def private_parent(path):
    path = no_links(path)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode), "PRIVATE_PARENT_NOT_DIRECTORY")
    if os.name == "nt":
        windows_private(path)
    else:
        require(info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700, "PRIVATE_PARENT_MODE_INVALID")
    return path


def make_private_directory(path):
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)
    if os.name == "nt":
        windows_private(path, secure=True)
    sync_directory(path.parent)


def sync_directory(path):
    if os.name != "nt":
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def verify_private_tree(path):
    no_links(path)
    def inspect_links(directory):
        for name in os.listdir(directory):
            item = directory / name
            info = item.lstat()
            require(not stat.S_ISLNK(info.st_mode) and not getattr(item, "is_junction", lambda: False)(), "LINK_REFUSED")
            if stat.S_ISDIR(info.st_mode):
                inspect_links(item)
            else:
                require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "NONREGULAR_OR_HARDLINK_REFUSED")
    inspect_links(path)
    if os.name == "nt":
        windows_private(path, tree=True)
        return
    for item in [path, *path.rglob("*")]:
        info = item.lstat()
        require(info.st_uid == os.geteuid() and not stat.S_ISLNK(info.st_mode), "PRIVATE_TREE_OWNER_INVALID")
        expected = 0o700 if stat.S_ISDIR(info.st_mode) else 0o600
        require(stat.S_IMODE(info.st_mode) == expected, "PRIVATE_TREE_MODE_INVALID")


def safe_relative(value):
    return (isinstance(value, str) and 0 < len(value) <= 4096 and "\\" not in value and "\0" not in value
            and not value.startswith("/") and not PureWindowsPath(value).drive
            and all(part not in ("", ".", "..") for part in value.split("/")))


def file_bytes(path, destination=None):
    no_links(path)
    initial = path.lstat()
    require(stat.S_ISREG(initial.st_mode) and initial.st_nlink == 1, "NONREGULAR_OR_HARDLINK_REFUSED")
    digest, length, header = hashlib.sha256(), 0, b""
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0))
    try:
        opened = signature(os.fstat(descriptor))
        # Windows Python exposes birth-time through lstat.st_ctime but change-time through
        # fstat.st_ctime on some runtimes. Keep each API's before/after value, and compare
        # stable file identity/mode/links/size/mtime across the two APIs.
        require(opened[:6] == signature(initial)[:6] if os.name == "nt" else opened == signature(initial), "SOURCE_REPLACED")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            while True:
                block = stream.read(CHUNK)
                if not block:
                    break
                if not header:
                    header = block[:16]
                digest.update(block)
                length += len(block)
                if destination is not None:
                    destination.write(block)
        require(signature(os.fstat(descriptor)) == opened, "SOURCE_CHANGED")
    finally:
        os.close(descriptor)
    no_links(path)
    require(signature(path.lstat()) == signature(initial) and length == initial.st_size, "SOURCE_CHANGED")
    return {"size": length, "sha256": digest.hexdigest(), "metadata": signature(initial),
            "sqlite": path.suffix.lower() in (".db", ".sqlite", ".sqlite3") or header == b"SQLite format 3\0"}


def inventory(root):
    root = no_links(root)
    require(root.is_dir(), "SOURCE_NOT_DIRECTORY")
    files, directories = [], []

    def walk(directory, relative=""):
        no_links(directory)
        before = directory.lstat()
        require(stat.S_ISDIR(before.st_mode), "SOURCE_DIRECTORY_CHANGED")
        names = sorted(os.listdir(directory))
        directories.append({"path": relative, "metadata": signature(before)})
        for name in names:
            child, child_relative = directory / name, relative + "/" + name if relative else name
            require(safe_relative(child_relative), "UNSAFE_SOURCE_NAME")
            info = child.lstat()
            require(not stat.S_ISLNK(info.st_mode) and not getattr(child, "is_junction", lambda: False)(), "LINK_REFUSED")
            if stat.S_ISDIR(info.st_mode):
                walk(child, child_relative)
            else:
                require(len(files) < MAX_FILES, "FILE_COUNT_LIMIT")
                files.append({"path": child_relative, **file_bytes(child)})
        require(names == sorted(os.listdir(directory)) and signature(directory.lstat()) == signature(before), "SOURCE_DIRECTORY_CHANGED")

    walk(root)
    return {"directories": directories, "files": files}


def content_inventory(value):
    return {"directories": sorted(item["path"] for item in value["directories"]),
            "files": sorted(({key: item[key] for key in ("path", "size", "sha256", "sqlite")} for item in value["files"]), key=lambda item: item["path"])}


def copy_inventory(source, target, expected):
    for item in sorted(expected["directories"], key=lambda row: row["path"].count("/")):
        if item["path"]:
            path = target / item["path"]
            # Python on Windows grants Administrators explicitly for mkdir(0700).
            # Inherit the already restricted parent ACL instead; POSIX keeps 0700.
            path.mkdir(mode=0o777 if os.name == "nt" else 0o700)
            os.chmod(path, 0o700)
    for item in expected["files"]:
        destination = target / item["path"]
        descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0), 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            copied = file_bytes(source / item["path"], stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(destination, 0o600)
        require(all(copied[key] == item[key] for key in ("size", "sha256", "sqlite")), "COPY_SOURCE_CHANGED")
    require(content_inventory(inventory(target)) == content_inventory(expected), "COPY_FINGERPRINT_MISMATCH")
    for item in sorted(expected["directories"], key=lambda row: len(Path(row["path"]).parts), reverse=True):
        sync_directory(target / item["path"])


def sqlite_integrity(payload, expected, parent):
    checked = 0
    by_path = {item["path"]: item for item in expected["files"]}
    for item in expected["files"]:
        if not item["sqlite"]:
            continue
        # SQLite may recover WAL/journal or write SHM while reading. Confine that to this disposable probe.
        with tempfile.TemporaryDirectory(prefix=".sqlite-probe-", dir=parent) as temporary:
            probe = Path(temporary)
            os.chmod(probe, 0o700)
            if os.name == "nt":
                windows_private(probe, secure=True)
            database = probe / "database.sqlite"
            for suffix in ("", "-wal", "-shm", "-journal"):
                row = by_path.get(item["path"] + suffix)
                if row is None:
                    continue
                destination = Path(str(database) + suffix)
                descriptor = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0), 0o600)
                with os.fdopen(descriptor, "wb") as stream:
                    actual = file_bytes(payload / row["path"], stream)
                require(actual["sha256"] == row["sha256"] and actual["size"] == row["size"], "SQLITE_PROBE_BYTES_CHANGED")
                os.chmod(destination, 0o600)
            connection = None
            try:
                connection = sqlite3.connect(database, timeout=10)
                result = connection.execute("PRAGMA integrity_check").fetchall()
                require(result == [("ok",)], "SQLITE_INTEGRITY_FAILED")
            except sqlite3.Error:
                raise RecoveryError("SQLITE_INTEGRITY_FAILED") from None
            finally:
                if connection is not None:
                    connection.close()
        checked += 1
    return checked


def write_private(path, data):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0), 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, 0o600)
    sync_directory(path.parent)


def validate_manifest(value):
    require(isinstance(value, dict) and value.get("schema") == SCHEMA and RELEASE.fullmatch(value.get("release", ""))
            and value.get("scope") in ("primary", "standby", "fixture") and isinstance(value.get("sourceRoot"), str)
            and isinstance(value.get("inventory"), dict), "MANIFEST_INVALID")
    rows = value["inventory"]
    require(isinstance(rows.get("files"), list) and isinstance(rows.get("directories"), list)
            and len(rows["files"]) <= MAX_FILES and len(rows["directories"]) <= MAX_FILES, "MANIFEST_INVALID")
    file_names, directory_names = set(), set()
    for row in rows["directories"]:
        require(isinstance(row, dict) and (row.get("path") == "" or safe_relative(row.get("path"))) and row["path"] not in directory_names, "MANIFEST_INVALID")
        directory_names.add(row["path"])
    require("" in directory_names, "MANIFEST_INVALID")
    for row in rows["files"]:
        require(isinstance(row, dict) and safe_relative(row.get("path")) and row["path"] not in file_names
                and isinstance(row.get("size"), int) and not isinstance(row["size"], bool) and row["size"] >= 0
                and isinstance(row.get("sha256"), str) and HASH.fullmatch(row["sha256"])
                and isinstance(row.get("sqlite"), bool), "MANIFEST_INVALID")
        parent_name = row["path"].rsplit("/", 1)[0] if "/" in row["path"] else ""
        require(row["path"] not in directory_names and parent_name in directory_names, "MANIFEST_INVALID")
        file_names.add(row["path"])
    for name in directory_names:
        if name:
            require((name.rsplit("/", 1)[0] if "/" in name else "") in directory_names, "MANIFEST_INVALID")
    return value


def summary(operation, value, manifest_hash, integrity):
    rows = value["inventory"]
    return {"status": "passed", "operation": operation, "release": value["release"], "scope": value["scope"],
            "files": len(rows["files"]), "directories": len(rows["directories"]),
            "bytes": sum(row["size"] for row in rows["files"]), "manifestSha256": manifest_hash,
            "sqliteDatabasesChecked": integrity, "sqliteIntegrity": "ok", "completeTreeVerified": True,
            "liveDirectoryModified": False, "automaticRollback": False}


def verify(snapshot, expected_hash, release):
    require(HASH.fullmatch(expected_hash or "") and RELEASE.fullmatch(release or ""), "EXPECTED_BINDING_INVALID")
    snapshot = no_links(snapshot)
    private_parent(snapshot.parent)
    verify_private_tree(snapshot)
    require(sorted(os.listdir(snapshot)) == ["manifest.json", "payload"], "SNAPSHOT_INVENTORY_INVALID")
    manifest_file = snapshot / "manifest.json"
    require(manifest_file.lstat().st_size <= MAX_MANIFEST and manifest_file.lstat().st_nlink == 1, "MANIFEST_SIZE_INVALID")
    raw = manifest_file.read_bytes()
    require(sha(raw) == expected_hash, "MANIFEST_FINGERPRINT_MISMATCH")
    try:
        value = validate_manifest(json.loads(raw))
    except (ValueError, TypeError, KeyError):
        raise RecoveryError("MANIFEST_INVALID") from None
    require(value["release"] == release, "RELEASE_BINDING_MISMATCH")
    before = inventory(snapshot / "payload")
    require(content_inventory(before) == content_inventory(value["inventory"]), "SNAPSHOT_FINGERPRINT_MISMATCH")
    count = sqlite_integrity(snapshot / "payload", value["inventory"], snapshot.parent)
    require(inventory(snapshot / "payload") == before and manifest_file.read_bytes() == raw, "SNAPSHOT_CHANGED")
    return value, count


def snapshot(source, destination, release, scope):
    require(RELEASE.fullmatch(release or "") and scope in ("primary", "standby", "fixture"), "SNAPSHOT_SCOPE_INVALID")
    source, destination = no_links(source), absolute(destination)
    parent = private_parent(destination.parent)
    require(not inside(destination, source) and not inside(source, destination), "SOURCE_DESTINATION_OVERLAP")
    require(not destination.exists() and not destination.is_symlink(), "DESTINATION_EXISTS")
    initial = inventory(source)
    make_private_directory(destination)
    payload = destination / "payload"
    make_private_directory(payload)
    copy_inventory(source, payload, initial)
    require(inventory(source) == initial, "SOURCE_CHANGED")
    checked = sqlite_integrity(payload, initial, parent)
    require(inventory(source) == initial, "SOURCE_CHANGED")
    value = {"schema": SCHEMA, "release": release, "scope": scope, "createdAt": datetime.now(timezone.utc).isoformat(),
             "sourceRoot": str(source), "inventory": initial, "sqliteDatabasesChecked": checked,
             "privateManifest": True, "sourceWasRequiredQuiescent": True}
    raw = encoded_json(value)
    require(len(raw) <= MAX_MANIFEST, "MANIFEST_SIZE_INVALID")
    write_private(destination / "manifest.json", raw)
    verify_private_tree(destination)
    require(content_inventory(inventory(payload)) == content_inventory(initial), "SNAPSHOT_CHANGED")
    return summary("snapshot-created", value, sha(raw), checked)


def restore(snapshot_path, target, expected_hash, release):
    snapshot_path, target = no_links(snapshot_path), absolute(target)
    parent = private_parent(snapshot_path.parent)
    require(target.parent == snapshot_path.parent and target != snapshot_path, "RESTORE_PRIVATE_SIBLING_REQUIRED")
    require(not target.exists() and not target.is_symlink(), "DESTINATION_EXISTS")
    value, _checked = verify(snapshot_path, expected_hash, release)
    source_root = absolute(value["sourceRoot"])
    require(not inside(target, source_root) and not inside(source_root, target), "LIVE_TARGET_REFUSED")
    make_private_directory(target)
    before = inventory(snapshot_path / "payload")
    copy_inventory(snapshot_path / "payload", target, value["inventory"])
    checked = sqlite_integrity(target, value["inventory"], parent)
    verify_private_tree(target)
    require(inventory(snapshot_path / "payload") == before, "SNAPSHOT_CHANGED")
    require(content_inventory(inventory(target)) == content_inventory(value["inventory"]), "RESTORE_FINGERPRINT_MISMATCH")
    return summary("isolated-restore-verified", value, expected_hash, checked)


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise RecoveryError("CLI_ARGUMENT_INVALID")


def main(argv=None):
    parser = Parser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True, parser_class=Parser)
    create = commands.add_parser("snapshot")
    create.add_argument("--source", required=True)
    create.add_argument("--snapshot", required=True)
    create.add_argument("--release", required=True)
    create.add_argument("--scope", choices=["primary", "standby", "fixture"], required=True)
    for name in ("verify", "restore"):
        command = commands.add_parser(name)
        command.add_argument("--snapshot", required=True)
        command.add_argument("--expect-manifest-sha256", required=True)
        command.add_argument("--release", required=True)
        if name == "restore":
            command.add_argument("--target", required=True)
    try:
        args = parser.parse_args(argv)
        if args.command == "snapshot":
            result = snapshot(args.source, args.snapshot, args.release, args.scope)
        elif args.command == "restore":
            result = restore(args.snapshot, args.target, args.expect_manifest_sha256, args.release)
        else:
            value, checked = verify(no_links(args.snapshot), args.expect_manifest_sha256, args.release)
            result = summary("snapshot-verified", value, args.expect_manifest_sha256, checked)
        print(json.dumps(result, separators=(",", ":")))
        return 0
    except Exception as error:
        code = str(error) if isinstance(error, RecoveryError) else "RECOVERY_OPERATION_FAILED"
        print(json.dumps({"status": "failed", "code": code, "liveDirectoryModified": False,
                          "automaticRollback": False, "partialPrivateOutputMayRemain": True}, separators=(",", ":")))
        return 1


if __name__ == "__main__":
    sys.exit(main())
