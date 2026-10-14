/** Only pure guards and controlled SQL adapters; never load app pool/config. */
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../.jarvis-dev/workspaces/msf-targets-r30/source/',import.meta.url));
export default {
 resolve:{alias:{'@msf/shared':fileURLToPath(new URL('../.jarvis-dev/workspaces/msf-targets-r30/source/packages/shared/src/index.ts',import.meta.url))}},
 test:{include:[root.replaceAll('\\','/')+'apps/server/src/modules/test/targeted-repair.test.ts'],environment:'node',maxWorkers:1,minWorkers:1,fileParallelism:false,coverage:{enabled:false}},
};
