import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock,patch

spec=importlib.util.spec_from_file_location('protection',Path(__file__).with_name('qnap-protection-collector.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CollectorTests(unittest.TestCase):
    def test_backup_metadata_never_exports_credentials_or_accounts(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'config.db';c=sqlite3.connect(path)
            c.execute('CREATE TABLE jobs(key,value)');c.execute('CREATE TABLE credentials(password)')
            c.execute('INSERT INTO jobs VALUES(?,?)',('job-one',json.dumps({'name':'Archive','state':'running','enabled':True,'password':'private-secret','credentials':{'key':'private-secret'},'source':'/private/family'})))
            c.commit();c.close();result=module.backup_jobs(path)
            self.assertEqual(result['jobs'][0]['state'],'running');self.assertNotIn('private',json.dumps(result));self.assertEqual(result['state'],'available')
            c=sqlite3.connect(path);self.assertEqual(c.execute('SELECT COUNT(*) FROM jobs').fetchone()[0],1);c.close()
    def test_smart_reports_attribute_assessment_and_unsupported_bridge_honestly(self):
        path=Mock();path.is_file.return_value=True;path.is_symlink.return_value=False;path.stat.return_value=Mock(st_size=200,st_mtime=1700000000)
        with patch.object(module,'Path',return_value=path):
            path.read_text.return_value='header\n194,Temperature,50,45,0,50,0\n197,Pending,100,100,0,0,0\n'
            result=module.smart(0,1,refresh=False);self.assertEqual(result['temperatureC'],50);self.assertEqual(result['state'],'attributes-ok')
            path.read_text.return_value='header\n197,Pending,100,100,0,3,0\n'
            self.assertEqual(module.smart(0,1,refresh=False)['state'],'warning')
            path.read_text.return_value='0,0,0,100,2,2,0,2,0,0x0000,-1,-1,8\n'
            result=module.smart(33,4);self.assertEqual(result['state'],'unsupported');self.assertIsNone(result['temperatureC'])

if __name__=='__main__':unittest.main()
