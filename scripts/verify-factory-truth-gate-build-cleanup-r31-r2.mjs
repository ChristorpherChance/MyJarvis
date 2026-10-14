import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {finiteBuildEvidenceCLI_R31R2} from './factory-build-evidence-read-r31-r2.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await finiteBuildEvidenceCLI_R31R2(true);
