import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {finiteBuildEvidenceCLI_R32} from './factory-build-evidence-read-r32.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await finiteBuildEvidenceCLI_R32(false);
