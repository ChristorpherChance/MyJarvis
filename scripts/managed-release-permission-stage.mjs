/** Pure Python fragment: preserve inherited private modes and durably bind each strip-only application. */
import {releasePermissionHardeningFragment} from './read-platform-release-permissions-r28.mjs';
export const stagedReleasePermissionFragment=releasePermissionHardeningFragment+String.raw`
def apply_staged_release_permissions(release,archive_sha):
 permission_plan=release_permission_hardening(release,archive_sha,apply=False)
 intent=Path('/var/lib/jarvis-control/release-permissions')
 for ancestor in [intent.parent,*intent.parent.parents]:
  ancestor_stat=ancestor.lstat()
  if not stat.S_ISDIR(ancestor_stat.st_mode) or ancestor_stat.st_uid!=0 or ancestor_stat.st_mode&0o022:raise RuntimeError('Release permissions intent ancestor is unsafe')
 import uuid
 intent_parent_fd=os.open(intent.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 try:
  try:os.mkdir(intent.name,mode=0o700,dir_fd=intent_parent_fd)
  except FileExistsError:pass
  intent_dir_fd=os.open(intent.name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=intent_parent_fd)
  try:
   intent_stat=os.fstat(intent_dir_fd)
   if not stat.S_ISDIR(intent_stat.st_mode) or intent_stat.st_uid!=0 or intent_stat.st_mode&0o077:raise RuntimeError('Private release permissions intent directory is unsafe')
   os.fsync(intent_parent_fd)
   intent_fd=os.open(str(uuid.uuid4())+'.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=intent_dir_fd)
   with os.fdopen(intent_fd,'w') as stream:
    json.dump(permission_plan,stream);stream.flush();os.fsync(stream.fileno())
   os.fsync(intent_dir_fd)
  finally:os.close(intent_dir_fd)
 finally:os.close(intent_parent_fd)
 return release_permission_hardening(release,archive_sha,apply=True,expected_identity=permission_plan['identity'],expected_metadata_sha256=permission_plan['metadataSHA256'])
`;
