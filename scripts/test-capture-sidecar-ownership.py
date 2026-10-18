"""New config ownership fixtures only: temporary files, no activation/service/DB.
Production root ancestor gate is replaced for non-root temp paths only; real file
bytes/mode/inode and fchown to our original uid/gid are checked. Alternate process
primary group is a controlled fake, not a real 112 ownership acceptance.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sidecar', Path(__file__).with_name('capture-activate-sidecar.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


def temp_safe(path, directory=False, private=False):
    info = path.lstat()
    assert not stat.S_ISLNK(info.st_mode)
    assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1
    assert info.st_uid == os.geteuid()


class Ownership(unittest.TestCase):
    def test_candidate_and_rollback_preserve_original_metadata_and_byte_hashes(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(s, 'safe', temp_safe):
            path = Path(tmp)/'config.json'
            old = b'{"release":"old-fixture"}\n'
            candidate = b'{"release":"candidate-fixture"}\n'
            path.write_bytes(old)
            path.chmod(0o640)
            raw, original = s.capture_config(path)
            self.assertEqual(raw, old)
            called = []
            real_chown = os.fchown
            def chown(fd, uid, gid):
                called.append((uid, gid))
                real_chown(fd, uid, gid)
            # A caller process-default group must not be used as the target group.
            with patch.object(s.os, 'getegid', return_value=original['gid']+71), patch.object(s.os, 'fchown', side_effect=chown):
                forward = s.config_write(path, candidate, original, 'candidate')
                self.assertEqual(path.read_bytes(), candidate)
                self.assertEqual(s.config_metadata(path.stat()), original)
                reverse = s.config_write(path, old, original, 'rollback')
            self.assertEqual(called, [(original['uid'], original['gid'])]*2)
            self.assertEqual(path.read_bytes(), old)
            self.assertEqual(s.config_metadata(path.stat()), original)
            for record, content in [(forward, candidate), (reverse, old)]:
                for key in ['originalMetadata','temporaryMetadata','writtenMetadata']:
                    self.assertEqual(record[key], original)
                self.assertEqual(record['writtenSHA256'], hashlib.sha256(content).hexdigest())
            self.assertNotIn('release', json.dumps(forward))
            print(json.dumps({'fixture':'forward-and-rollback','metadata':original,'candidateSHA256':forward['writtenSHA256'],'rollbackSHA256':reverse['writtenSHA256'],'actual112PermissionsVerified':False}))

    def test_chown_or_metadata_verification_failure_refuses_before_replace(self):
        for failure in ('chown', 'verify'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as tmp, patch.object(s, 'safe', temp_safe):
                path=Path(tmp)/'config.json'
                original_bytes=b'fixture original bytes\n'
                path.write_bytes(original_bytes)
                path.chmod(0o640)
                _, metadata=s.capture_config(path)
                signature=s.config_signature(path.lstat())
                if failure=='chown':
                    change=patch.object(s.os,'fchown',side_effect=PermissionError('fixture denied'))
                else:
                    change=patch.object(s.os,'fchmod',return_value=None)  # leaves WX temp 0600
                with change, patch.object(s.os,'replace') as replace:
                    with self.assertRaises((PermissionError,s.Fault)):
                        s.config_write(path,b'candidate bytes',metadata,failure)
                    replace.assert_not_called()
                self.assertEqual(path.read_bytes(),original_bytes)
                self.assertEqual(s.config_signature(path.lstat()),signature)
                self.assertEqual(s.config_metadata(path.lstat()),metadata)
                print(json.dumps({'fixture':failure,'replaceCalled':False,'originalSHA256':hashlib.sha256(path.read_bytes()).hexdigest(),'metadata':metadata}))


if __name__ == '__main__':
    unittest.main(verbosity=2)
