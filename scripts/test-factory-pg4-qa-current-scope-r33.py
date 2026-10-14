"""One finite controlled group. No generated program, process, syscall or actor creation."""
import ast, datetime, hashlib, json, re, select, unittest
from pathlib import Path

class CurrentScopeControls(unittest.TestCase):
    def test_current_scope_default_unknown_and_closed_denominator(self):
        raw=Path('scripts/factory-pg4-qa-current-scope-observer-r33.py').read_bytes()
        tree=ast.parse(raw);names={'need','digest','canonical','stat_key','actor_core','validate_payload','scan_closed','error','observe_pg4_qa_current_scope_r33'}
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'PROTOCOL','STARTUP','BASE','ROLES','REPORTS','H','CORE'} for t in n.targets)]
        class NoOS:
            def __getattr__(self,name):raise AssertionError('UNAUTHORIZED_OS_TOUCH')
        scope={'re':re,'hashlib':hashlib,'json':json,'select':select,'datetime':datetime,'os':NoOS()}
        exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-current-scope-selected-definitions>','exec'),scope)
        self.assertFalse(scope['observe_pg4_qa_current_scope_r33'](None)['ready'])
        self.assertEqual(scope['observe_pg4_qa_current_scope_r33']({})['readError']['errorCode'],'PG4_D_PARAMETERS_CHANGED')
        with self.assertRaisesRegex(RuntimeError,'ACTOR_HISTORY_UNKNOWN'):scope['actor_core'](None)
        scan={'listedPIDs':[1,2],'inspectedPIDs':[1],'exitedDuringScan':[],'readIncompletePIDs':[2],'counts':{'listed':2,'inspected':1,'pidfdProvenExits':0,'incomplete':1},'relatedProcesses':[],'ack':{'counts':{'runs':0,'deliveries':0,'logs':0}}}
        self.assertFalse(scope['scan_closed'](scan))
        scan['readIncompletePIDs']=[]
        with self.assertRaisesRegex(RuntimeError,'COUNTS_NOT_CLOSED'):scope['scan_closed'](scan)

if __name__=='__main__':unittest.main()
