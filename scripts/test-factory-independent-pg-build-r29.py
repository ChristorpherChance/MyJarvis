"""Local preparation guards only. No Docker, PG, installer or remote operation."""
import copy, hashlib, importlib.util, json, stat, unittest
from pathlib import Path
from types import SimpleNamespace

HERE=Path(__file__).parent
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
lock=module('pg_lock',HERE/'prepare-factory-independent-pg-lock-r29.py')
build=module('pg_build',HERE/'factory-build-independent-pg-runtime-r29.py')
freeze=module('pg_freeze',HERE/'factory-freeze-independent-pg-runtime-r29.py')

def cache():
    root='/var/lib/jarvis-development/101/truth-gate-r29-build/'+'a'*32+'/caches/pnpm-store'
    entries=[{'path':'.','kind':'directory','metadata':[7,11,0,0,stat.S_IFDIR|0o555,2,0,1,1]},
             {'path':'index','kind':'file','sha256':'a'*64,'bytes':3,'metadata':[7,12,0,0,stat.S_IFREG|0o555,1,3,1,1]}]
    content=[{'path':'.','kind':'directory'},{'path':'index','kind':'file','sha256':'a'*64,'bytes':3,'executable':True}]
    return {'schemaVersion':1,'kind':'r29-independent-readonly-cache-closure','root':root,'identity':{'device':7,'inode':11},'files':1,'entries':entries,'bytes':3,'contentTreeSHA256':build.sha(build.compact(content)),'metadataSHA256':build.sha(build.compact(entries)),'rootOwnedReadOnly':True,'sharedHardlinks':False,'symlinks':False}

class LockTests(unittest.TestCase):
    def setUp(self):self.raw=lock.SOURCE.read_bytes()
    def test_exact_closure_and_artifact_bytes(self):
        package,raw,receipt=lock.extract(self.raw,lock.SOURCE_SHA)
        self.assertEqual(receipt['packageCount'],14);self.assertEqual(receipt['snapshotCount'],14)
        self.assertEqual(package,(lock.OUTPUT/'package.json').read_bytes());self.assertEqual(raw,(lock.OUTPUT/'pnpm-lock.yaml').read_bytes())
        self.assertIn(b'  pg-cloudflare@1.4.0:\n    optional: true',raw)
        self.assertIn(b'pg-pool@3.14.0(pg@8.23.0)',raw)
        self.assertEqual(json.loads(package)['dependencies'],{'pg':'8.23.0'})
    def test_source_hash_change_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'SOURCE_CHANGED'):lock.extract(self.raw+b'\n',lock.SOURCE_SHA)
    def altered(self,old,new,code):
        raw=self.raw.replace(old,new);self.assertNotEqual(raw,self.raw)
        with self.assertRaisesRegex(RuntimeError,code):lock.extract(raw,hashlib.sha256(raw).hexdigest())
    def test_optional_flag_not_dropped(self):self.altered(b'  pg-cloudflare@1.4.0:\n    optional: true',b'  pg-cloudflare@1.4.0: {}','DEPENDENCY_GRAPH_CHANGED')
    def test_pg_pool_peer_snapshot_unchanged(self):self.altered(b'  pg-pool@3.14.0(pg@8.23.0):',b'  pg-pool@3.14.0:','CLOSURE_MISSING')
    def test_dependency_upgrade_is_not_silent(self):self.altered(b'      pg-types: 2.2.0',b'      pg-types: 3.0.0','DEPENDENCY_GRAPH_CHANGED')
    def test_lock_settings_not_inferred(self):self.altered(b'  autoInstallPeers: true',b'  autoInstallPeers: false','SETTINGS_CHANGED')
    def test_resolution_integrity_required(self):
        raw=self.raw.replace(b'  pg@8.23.0:\n    resolution: {integrity:',b'  pg@8.23.0:\n    resolution: {tarball:',1)
        with self.assertRaisesRegex(RuntimeError,'INTEGRITY_REQUIRED'):lock.extract(raw,hashlib.sha256(raw).hexdigest())
    def test_custom_snapshot_field_refused(self):self.altered(b'  pgpass@1.0.5:\n    dependencies:',b'  pgpass@1.0.5:\n    custom: true\n    dependencies:','SNAPSHOT_LAYOUT')

class CacheTests(unittest.TestCase):
    def test_closed_executable_readonly_cache_accepted(self):
        v=cache();self.assertEqual(build.validate_cache_manifest(v,v['root']),v)
    def bad(self,mutate,code):
        v=cache();mutate(v)
        with self.assertRaisesRegex(RuntimeError,code):build.validate_cache_manifest(v,v['root'])
    def test_sibling_namespace_rejected(self):self.bad(lambda v:v.update(root='/home/user/cache'),'NAMESPACE_INVALID')
    def test_cache_symlink_claim_refused(self):self.bad(lambda v:v.update(symlinks=True),'MANIFEST_INVALID')
    def test_shared_hardlink_claim_refused(self):self.bad(lambda v:v.update(sharedHardlinks=True),'MANIFEST_INVALID')
    def test_file_hardlink_refused(self):self.bad(lambda v:v['entries'][1]['metadata'].__setitem__(5,2),'FILE_INVALID')
    def test_nonroot_output_refused(self):self.bad(lambda v:v['entries'][1]['metadata'].__setitem__(2,1000),'OWNER_OR_MODE_INVALID')
    def test_writable_file_refused(self):self.bad(lambda v:v['entries'][1]['metadata'].__setitem__(4,stat.S_IFREG|0o666),'OWNER_OR_MODE_INVALID')
    def test_bool_metadata_refused(self):self.bad(lambda v:v['entries'][1]['metadata'].__setitem__(0,True),'METADATA_INVALID')
    def test_bool_total_refused(self):self.bad(lambda v:v.update(files=True),'TOTALS_INVALID')
    def test_extra_manifest_field_refused(self):self.bad(lambda v:v.update(unverified=True),'MANIFEST_INVALID')
    def test_duplicate_file_refused(self):self.bad(lambda v:v['entries'].append(copy.deepcopy(v['entries'][1])),'PATH_INVALID')
    def test_missing_parent_refused(self):self.bad(lambda v:v['entries'][1].update(path='missing/index'),'PARENT_MISSING')
    def test_path_escape_refused(self):self.bad(lambda v:v['entries'][1].update(path='../index'),'PATH_INVALID')
    def test_content_hash_not_optional(self):self.bad(lambda v:v.update(contentTreeSHA256='b'*64),'TREE_HASH_INVALID')
    def test_metadata_hash_not_optional(self):self.bad(lambda v:v.update(metadataSHA256='b'*64),'TREE_HASH_INVALID')
    def test_root_inode_refused(self):self.bad(lambda v:v['identity'].update(inode=55),'ROOT_IDENTITY_INVALID')
    def test_default_pins_refuse_actual_preparation(self):
        self.assertFalse(build.preparation_ready());self.assertFalse(build.inspect_preparation()['ready']);self.assertIsNone(build.inspect_preparation()['actualManifestPin'])

class ContainerTests(unittest.TestCase):
    def setUp(self):
        self.attempt='c'*32;self.work=build.ROOT/self.attempt/'work';self.caches=[{'name':n,'root':'/root/private/'+n} for n in build.CACHE_NAMES]
        self.v={'Name':'/'+build.container_name(self.attempt),'Image':build.IMAGE,'Config':{'User':'1000:1000','Entrypoint':[build.INSTALL[0]],'Cmd':build.INSTALL[1:],'WorkingDir':'/work/runtime','Labels':build.labels(self.attempt),'Volumes':None,'Healthcheck':None,'Env':['PATH=/usr/local/bin:/usr/bin:/bin','CI=1','HOME=/work/home','COREPACK_HOME=/corepack-cache','COREPACK_ENABLE_NETWORK=0','NODE_PATH=','NODE_OPTIONS=','PG_FORCE_NATIVE=']},'HostConfig':{'NetworkMode':'none','ReadonlyRootfs':True,'Privileged':False,'CapDrop':['ALL'],'CapAdd':None,'SecurityOpt':['no-new-privileges'],'PidsLimit':128,'Memory':1024**3,'NanoCpus':10**9,'Init':True,'Tmpfs':{'/tmp':'rw,nosuid,nodev,size=128m'}},'Mounts':[{'Source':str(self.work),'Destination':'/work','RW':True,'Type':'bind'}]+[{'Source':c['root'],'Destination':'/'+c['name'],'RW':False,'Type':'bind'} for c in self.caches]}
    def test_offline_copy_commands_never_shell_or_candidate(self):
        command=build.create_command(self.attempt,self.work,self.caches)
        self.assertIn('--package-import-method=copy',command);self.assertIn('--offline',command);self.assertIn('--frozen-lockfile',command);self.assertIn('--ignore-scripts',command)
        self.assertIn('1000:1000',command);self.assertIn('none',command);self.assertNotIn('/var/run/docker.sock',' '.join(command));self.assertNotIn('/work/source',' '.join(command))
    def test_precise_container_accepted(self):self.assertEqual(build.assert_container(self.v,self.attempt,self.work,self.caches),self.v)
    def bad(self,mutation,code):
        mutation(self.v)
        with self.assertRaisesRegex(RuntimeError,code):build.assert_container(self.v,self.attempt,self.work,self.caches)
    def test_root_user_refused(self):self.bad(lambda v:v['Config'].update(User='0:0'),'CONFIG_CHANGED')
    def test_wrong_image_refused(self):self.bad(lambda v:v.update(Image='sha256:'+'a'*64),'IDENTITY_CHANGED')
    def test_network_refused(self):self.bad(lambda v:v['HostConfig'].update(NetworkMode='bridge'),'ISOLATION_CHANGED')
    def test_privileged_refused(self):self.bad(lambda v:v['HostConfig'].update(Privileged=True),'ISOLATION_CHANGED')
    def test_scripts_flag_removed_refused(self):self.bad(lambda v:v['Config']['Cmd'].remove('--ignore-scripts'),'CONFIG_CHANGED')
    def test_socket_extra_mount_refused(self):self.bad(lambda v:v['Mounts'].append({'Source':'/var/run/docker.sock','Destination':'/var/run/docker.sock','Type':'bind','RW':True}),'MOUNTS_CHANGED')
    def test_cache_writable_refused(self):self.bad(lambda v:v['Mounts'][1].update(RW=True),'MOUNTS_CHANGED')
    def test_unlisted_tmpfs_refused(self):self.bad(lambda v:v['HostConfig']['Tmpfs'].update({'/other':'rw'}),'EXTRA_CAPABILITY')
    def test_autostart_healthcheck_refused(self):self.bad(lambda v:v['Config'].update(Healthcheck={'Test':['CMD','unsafe']}),'CONFIG_CHANGED')
    def test_node_preload_not_empty_refused(self):self.bad(lambda v:v['Config']['Env'].append('NODE_OPTIONS=--require=external'),'ENV_CHANGED')
    def test_external_loader_environment_refused(self):self.bad(lambda v:v['Config']['Env'].append('NODE_PATH=/outside'),'ENV_CHANGED')
    def test_missing_offline_environment_refused(self):self.bad(lambda v:v['Config']['Env'].remove('COREPACK_ENABLE_NETWORK=0'),'ENV_CHANGED')
    def test_invalid_attempt_refused(self):
        with self.assertRaisesRegex(RuntimeError,'ATTEMPT_INVALID'):build.container_name('../other')

class FreezeTests(unittest.TestCase):
    def s(self,kind='file',uid=0,mode=0o444,nlink=1):return SimpleNamespace(st_mode={'file':stat.S_IFREG,'directory':stat.S_IFDIR,'symlink':stat.S_IFLNK}[kind]|mode,st_uid=uid,st_gid=uid,st_nlink=nlink,st_size=10)
    def test_frozen_single_link_file(self):freeze.check_stat(self.s(),'file',True)
    def test_root_created_symlink_permission_bits_not_writable_file(self):freeze.check_stat(self.s('symlink',mode=0o777),'symlink',True)
    def test_uid1000_install_tree_before_copy(self):freeze.check_stat(self.s(uid=1000,mode=0o600),'file',False)
    def test_frozen_hardlink_refused(self):
        with self.assertRaisesRegex(RuntimeError,'NOT_INDEPENDENT'):freeze.check_stat(self.s(nlink=2),'file',True)
    def test_frozen_writable_refused(self):
        with self.assertRaisesRegex(RuntimeError,'WRITABLE'):freeze.check_stat(self.s(mode=0o666),'file',True)
    def test_install_root_not_misclassified_as_uid1000(self):
        with self.assertRaisesRegex(RuntimeError,'OWNER_INVALID'):freeze.check_stat(self.s(),'file',False)
    def test_internal_pnpm_link_allowed(self):self.assertTrue(freeze.link_valid('node_modules/pg','.pnpm/pg@8.23.0/node_modules/pg'))
    def test_internal_parent_link_allowed(self):self.assertTrue(freeze.link_valid('node_modules/.pnpm/pg-pool/node_modules/pg','../../pg@8.23.0/node_modules/pg'))
    def test_escape_link_refused(self):self.assertFalse(freeze.link_valid('node_modules/pg','../../outside'))
    def test_absolute_link_refused(self):self.assertFalse(freeze.link_valid('node_modules/pg','/home/user/node_modules/pg'))
    def test_windows_link_refused(self):self.assertFalse(freeze.link_valid('node_modules/pg','..\\outside'))
    def test_wrong_attempt_cleanup_refused(self):
        with self.assertRaisesRegex(RuntimeError,'SCOPE_INVALID'):freeze.check_cleanup({'kind':'r29-pg-runtime-install-independent-cleanup','attempt':'b'*32,'imageID':freeze.IMAGE},'a'*32)
    def test_unknown_writer_cleanup_refused(self):
        value={'kind':'r29-pg-runtime-install-independent-cleanup','attempt':'a'*32,'imageID':freeze.IMAGE,'processesComplete':True,'dockerComplete':True,'ownerComplete':True,'relatedWritersAbsent':False,'independent':True,'productCodeExecuted':False,'pgRuntimeAccepted':False}
        with self.assertRaisesRegex(RuntimeError,'UNPROVEN'):freeze.check_cleanup(value,'a'*32)

class MemNode:
    serial=100
    def __init__(self,kind='file',data=b'x',uid=1000,mode=None,target=None,nlink=1):
        MemNode.serial+=1;self.inode=MemNode.serial;self.kind=kind;self.data=bytearray(data);self.uid=uid;self.mode=mode if mode is not None else {'file':0o600,'directory':0o700,'symlink':0o777}[kind];self.target=target;self.nlink=nlink;self.children={};self.changed=1
    def stat(self):
        return SimpleNamespace(st_dev=8,st_ino=self.inode,st_uid=self.uid,st_gid=self.uid,st_mode={'file':stat.S_IFREG,'directory':stat.S_IFDIR,'symlink':stat.S_IFLNK,'socket':stat.S_IFSOCK}[self.kind]|self.mode,st_nlink=self.nlink,st_size=len(self.data) if self.kind=='file' else 0,st_mtime_ns=self.changed,st_ctime_ns=self.changed)

class MemOS:
    O_RDONLY=0;O_WRONLY=1;O_CREAT=64;O_EXCL=128;O_NONBLOCK=2048;O_DIRECTORY=65536;O_NOFOLLOW=131072
    def __init__(self):
        self.source=MemNode('directory');self.source.children={'package.json':MemNode(data=(lock.OUTPUT/'package.json').read_bytes()),'pnpm-lock.yaml':MemNode(data=(lock.OUTPUT/'pnpm-lock.yaml').read_bytes()),'node_modules':MemNode('directory')};nm=self.source.children['node_modules'];nm.children={'pg':MemNode('symlink',target='.pnpm/pg/node_modules/pg'),'plain':MemNode(data=b'actual controlled bytes')};self.target=MemNode('directory',uid=0);self.fds={1:[self.source,0],2:[self.target,0]};self.next=10;self.change=None;self.triggered=False;self.zero_write=False
    def fstat(self,fd):return self.fds[fd][0].stat()
    def listdir(self,fd):return list(self.fds[fd][0].children)
    def stat(self,name,dir_fd,follow_symlinks=False):
        assert follow_symlinks is False;return self.fds[dir_fd][0].children[name].stat()
    def open(self,name,flags,mode=0o600,dir_fd=None):
        assert flags&self.O_NOFOLLOW;parent=self.fds[dir_fd][0]
        if self.change and not self.triggered and parent is self.source and name=='package.json' and not flags&self.O_CREAT:
            self.triggered=True
            if self.change=='same-inode-write':parent.children[name].data.extend(b'!');parent.children[name].changed+=1
            if self.change=='replace-inode':parent.children[name]=MemNode(data=b'different')
        if flags&self.O_CREAT:
            assert flags&self.O_EXCL and name not in parent.children;parent.children[name]=MemNode(data=b'',uid=0,mode=mode)
        node=parent.children[name]
        if node.kind=='symlink':raise OSError('controlled nofollow')
        if flags&self.O_DIRECTORY:assert node.kind=='directory'
        self.next+=1;self.fds[self.next]=[node,0];return self.next
    def read(self,fd,n):
        node,offset=self.fds[fd];value=bytes(node.data[offset:offset+n]);self.fds[fd][1]+=len(value);return value
    def write(self,fd,view):
        if self.zero_write:return 0
        node,offset=self.fds[fd];node.data[offset:offset+len(view)]=view;self.fds[fd][1]+=len(view);return len(view)
    def mkdir(self,name,mode,dir_fd):self.fds[dir_fd][0].children[name]=MemNode('directory',uid=0,mode=mode)
    def readlink(self,name,dir_fd):return self.fds[dir_fd][0].children[name].target
    def symlink(self,target,name,dir_fd):self.fds[dir_fd][0].children[name]=MemNode('symlink',uid=0,target=target)
    def fchmod(self,fd,mode):self.fds[fd][0].mode=mode
    def fsync(self,fd):assert fd in self.fds
    def close(self,fd):del self.fds[fd]

class HeldCopyTests(unittest.TestCase):
    def setUp(self):self.real=freeze.os;self.fs=MemOS();freeze.os=self.fs
    def tearDown(self):freeze.os=self.real
    def test_actual_tree_function_copies_detached_closed_bytes(self):
        before=freeze.tree(1);copied=freeze.tree(1,copy_fd=2);self.assertEqual(before,copied);self.fs.fchmod(2,0o555);after=freeze.tree(2,frozen=True);self.assertEqual(before['entries'],after['entries']);self.assertEqual(freeze.manifest(after)['treeSHA256'],freeze.sha(freeze.raw_json(after['entries'])));self.assertNotEqual(self.fs.source.children['package.json'].inode,self.fs.target.children['package.json'].inode);self.assertEqual(self.fs.target.children['package.json'].uid,0);self.assertEqual(self.fs.target.children['package.json'].nlink,1);self.assertEqual(set(self.fs.fds),{1,2})
    def test_same_inode_write_between_stat_open_refused(self):
        self.fs.change='same-inode-write'
        with self.assertRaisesRegex(RuntimeError,'PREOPEN_CHANGED'):freeze.tree(1,copy_fd=2)
        self.assertEqual(set(self.fs.fds),{1,2})
    def test_inode_replacement_between_stat_open_refused(self):
        self.fs.change='replace-inode'
        with self.assertRaisesRegex(RuntimeError,'PREOPEN_CHANGED'):freeze.tree(1,copy_fd=2)
        self.assertEqual(set(self.fs.fds),{1,2})
    def test_short_write_refused_and_all_child_fds_closed(self):
        self.fs.zero_write=True
        with self.assertRaisesRegex(RuntimeError,'SHORT_WRITE'):freeze.tree(1,copy_fd=2)
        self.assertEqual(set(self.fs.fds),{1,2})
    def test_input_hardlink_refused(self):
        self.fs.source.children['package.json'].nlink=2
        with self.assertRaisesRegex(RuntimeError,'NOT_INDEPENDENT'):freeze.tree(1,copy_fd=2)
    def test_input_symlink_escape_refused(self):
        self.fs.source.children['node_modules'].children['pg'].target='../../external'
        with self.assertRaisesRegex(RuntimeError,'LINK_ESCAPES_RUNTIME'):freeze.tree(1,copy_fd=2)
    def test_unknown_special_tree_type_refused(self):
        self.fs.source.children['package.json'].kind='socket'
        with self.assertRaisesRegex(RuntimeError,'TYPE_INVALID'):freeze.tree(1,copy_fd=2)
    def test_frozen_extra_file_is_present_in_actual_manifest(self):
        freeze.tree(1,copy_fd=2);self.fs.fchmod(2,0o555);before=freeze.tree(2,frozen=True);self.fs.target.children['extra']=MemNode(uid=0,mode=0o444);after=freeze.tree(2,frozen=True);self.assertNotEqual(before['entries'],after['entries']);self.assertTrue(any(e['path']=='extra' for e in after['entries']))

if __name__=='__main__':unittest.main(verbosity=1)
