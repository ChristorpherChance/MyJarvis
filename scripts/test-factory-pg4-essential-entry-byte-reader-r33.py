"""Two finite actual-AST data/fake-OS groups, no real IO, package import or kernel."""
import ast,base64,hashlib,json,posixpath,re,stat,unittest
from pathlib import Path
from types import SimpleNamespace

def definitions(fake):
    tree=ast.parse(Path('scripts/factory-pg4-essential-entry-byte-reader-r33.py').read_bytes())
    nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) or isinstance(n,ast.Assign)]
    scope={'base64':base64,'hashlib':hashlib,'json':json,'posixpath':posixpath,'re':re,'stat':stat,'os':fake}
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-new-essential-byte-definitions>','exec'),scope)
    return scope

class EssentialByteControls(unittest.TestCase):
    def test_default_and_ordered_literal_export_selection(self):
        class NoOS:
            def __getattr__(self,name):raise AssertionError('REAL_OS_FORBIDDEN')
        s=definitions(NoOS());self.assertFalse(s['run'](None)['readComplete']);select=s['select_entry'];root='fixed/package'
        target,branch=select({'exports':{'types':'./types.d.ts','default':'./early.js','node':'./late.js'}},'vite',root)
        self.assertEqual((target,branch),(root+'/early.js',['exports','default']))
        self.assertEqual(select({'exports':{'./client':{'types':'./types.d.ts','node':{'import':'./client.js','require':'./other.cjs'}}}},'vite-node/client',root),(root+'/client.js',['exports','./client','node','import']))
        self.assertEqual(select({'main':'literal.js'},'chai',root),(root+'/literal.js',['main']))
        for package in [{'exports':['./x.js']},{'exports':{'unknown':'./x.js','default':'./ok.js'}},{'exports':'../outside.js'},{'exports':'./*.js'},{}]:
            with self.assertRaises(RuntimeError):select(package,'vite',root)
        with self.assertRaises(RuntimeError):select({'main':'literal.js'},'vite-node/server',root)
        with self.assertRaises(RuntimeError):s['decode'](b'{"x":1,"x":2}')
        self.assertEqual(s['decode'](b'{"nanoseconds":9007199254740993}')['nanoseconds'],9007199254740993)

    def test_first_error_and_second_mismatch_preserve_bytes_fd_zero(self):
        info=SimpleNamespace(st_dev=3,st_ino=9,st_uid=0,st_gid=0,st_mode=stat.S_IFREG|0o444,st_nlink=1,st_size=3,st_mtime_ns=2**53+1,st_ctime_ns=2**53+2)
        class FakeOS:
            O_RDONLY=0;O_NOFOLLOW=1;O_NONBLOCK=2;O_CLOEXEC=4;SEEK_SET=0
            def __init__(self,blocks):self.blocks=iter(blocks);self.closes=[]
            def stat(self,*a,**kw):return info
            def fstat(self,*a):return info
            def open(self,*a,**kw):return 0
            def read(self,*a):
                block=next(self.blocks)
                if isinstance(block,Exception):raise block
                return block
            def lseek(self,*a):return 0
            def close(self,fd):self.closes.append(fd);raise OSError(5,'controlled close failure')
        original=OSError(13,'controlled read failure');fake=FakeOS([original]);r=definitions(fake)['Reader']()
        with self.assertRaises(OSError) as raised:r.read(2,'leaf',8,label='controlled')
        self.assertIs(raised.exception,original);self.assertEqual(r.first['errno'],13);self.assertEqual(r.secondary[0]['errno'],5);self.assertEqual(fake.closes,[0]);self.assertIn(0,r.close_unresolved);self.assertFalse(r.partial[0]['originalFirstReadBytes'])
        fake=FakeOS([b'abc',b'',b'abd']);r=definitions(fake)['Reader']()
        with self.assertRaisesRegex(RuntimeError,'SECOND_BYTES_CHANGED'):r.read(2,'leaf',8,label='controlled')
        self.assertEqual(base64.b64decode(r.partial[0]['originalFirstReadBase64']),b'abc');self.assertEqual(base64.b64decode(r.partial[0]['secondReadMismatchBlockBase64']),b'abd');self.assertEqual(r.partial[0]['secondReadMatchingPrefixBytes'],0);self.assertEqual(r.first['phase'],'FILE_SECOND_READ');self.assertEqual(r.secondary[0]['errno'],5);self.assertEqual(fake.closes,[0])

if __name__=='__main__':unittest.main()
