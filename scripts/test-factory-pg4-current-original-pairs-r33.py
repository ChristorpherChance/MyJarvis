"""One new actual-AST data group; no OS, census, actors, framework or generated program."""
import ast, copy, re, stat, unittest
from pathlib import Path

class OriginalPairControls(unittest.TestCase):
    def test_original_report_metadata_and_exact_optional_pair(self):
        tree=ast.parse(Path('scripts/factory-pg4-qa-current-scope-observer-r33.py').read_bytes())
        selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'need','original_report_pairs'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'REPORTS','H'} for t in n.targets)]
        scope={'re':re,'stat':stat};exec(compile(ast.Module(body=selected,type_ignores=[]),'<actual-original-pair-data-only>','exec'),scope)
        root='/controlled-only/pg4';rows={};reports=[];h='a'*64;ns=2**53+111
        def add(name):
            metadata=[8,99,1000,1000,stat.S_IFREG|0o600,1,7,ns,ns+1]
            report={'name':name,'sourceMetadata':metadata,'retainedOriginal':{'path':root+'/work/retained-'+name,'sha256':h,'bytes':7},'originalSHA256':h,'originalBytes':7,'sourceWasReadTwice':True}
            rows['evidence/'+name]={'sha256':h,'bytes':7,'metadata':metadata.copy(),'readComplete':True}
            rows['work/retained-'+name]={'sha256':h,'bytes':7,'metadata':[8,100,0,0,stat.S_IFREG|0o444,1,7,ns+2,ns+3],'readComplete':True}
            return report
        for name in scope['REPORTS']:reports.append(add(name))
        optional={'schemaVersion':1,'kind':'r33-pg4-optional-physical-error-original-byte-retention','name':'pg4-physical-admission-error.json','status':'absent','presenceObservationComplete':True,'retainedOriginal':None,'sourceMetadata':None,'originalSHA256':None,'originalBytes':None,'sourceWasReadTwice':None,'firstFailure':None}
        state={'reports':reports,'optionalPhysicalError':optional};validate=scope['original_report_pairs']
        self.assertTrue(validate(state,rows,root))
        changed=copy.deepcopy(rows);changed['evidence/'+reports[0]['name']]['metadata'][7]+=1
        with self.assertRaisesRegex(RuntimeError,'REPORT_ORIGINAL_CHANGED'):validate(state,changed,root)
        changed=copy.deepcopy(rows);changed['work/retained-'+reports[0]['name']]['sha256']='b'*64
        with self.assertRaisesRegex(RuntimeError,'REPORT_ORIGINAL_CHANGED'):validate(state,changed,root)
        optional.update(add(optional['name']));optional['status']='retained'
        self.assertTrue(validate(state,rows,root))
        changed=copy.deepcopy(rows);changed['evidence/'+optional['name']]['metadata'][8]+=1
        with self.assertRaisesRegex(RuntimeError,'REPORT_ORIGINAL_CHANGED'):validate(state,changed,root)
        changed=copy.deepcopy(rows);del changed['work/retained-'+optional['name']]
        with self.assertRaisesRegex(RuntimeError,'REPORT_ORIGINAL_CHANGED'):validate(state,changed,root)
        optional['status']='absent'
        with self.assertRaisesRegex(RuntimeError,'OPTIONAL_ERROR_HISTORY_UNKNOWN'):validate(state,rows,root)

if __name__=='__main__':unittest.main()
