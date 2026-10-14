/** Pure, prepared source transformation. No IO, execution, CLI or operational activation. */
import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const need = (value, code) => {if (!value) throw Error(code)};
const original = Object.freeze({
 native: 'b357b2d4afaab2938a5e226d42ffbe6d12d3757f0973488ad696108761a36a78',
 build: 'e2385dcb6001fcc1524a72edac61fc671e83be62339308daabfb5822dda8c1ba',
});
const moduleSHA256 = 'ab981cf22e75c75946a85150bffbd051ece574143446fd6b22f6a383bc44c6d8';
const exitProofSHA256 = 'c0e02a02fe488c474e879c80cc89c2c445aead72c42275f9f0b0f264cc4d660a';

export const singleEntryBoundCensusR33Preparation = Object.freeze({
 schemaVersion: 1, kind: 'r33-single-entry-bound-census-preparation',
 moduleSHA256, originalProgramSHA256: original,
 actualSourceQualificationRef: null, mappingQualificationRef: null,
 preparedOnly: true, operationalQualified: false, wholeCensusQualified: false,
 remoteOperations: false,
});

const adapter = String.raw`
class SingleEntryR33:
 def __init__(self,name,inode):self.name=name;self._inode=inode
 def inode(self):return self._inode

class SingleEntryDirectoryR33:
 # Borrow the original held directory and cursor. Its original finally owns close.
 def __init__(self,fd,tag):
  _need(tag in ('PROC_SINGLE_GETDENTS47','FD_SINGLE_GETDENTS47'),'R33_SINGLE_DIRENT_TAG_INVALID')
  self.fd=fd;self.tag=tag;self.library=None;self.entered=False;self.closed=False
 def tagged(self,call):
  try:return call()
  except BaseException as error:
   # Preserve the original error and errno; the legacy first-read subphase stays authoritative.
   error.singleDirentAcquisitionR33=self.tag
   raise
 def __enter__(self):
  self.library=self.tagged(_linux_libc_r33);self.entered=True;return self
 def __iter__(self):return self
 def __next__(self):
  self.tagged(lambda:_need(self.entered and not self.closed,'R33_SINGLE_DIRENT_ITERATOR_STATE_INVALID'))
  while True:
   record=self.tagged(lambda:_read_single_dirent_from_libc_r33(self.fd,self.library))
   if record is None:raise StopIteration
   # os.scandir omits these entries; restore that exact behavior before original counts.
   if record['name'] in (b'.',b'..'):continue
   name=self.tagged(lambda:os.fsdecode(record['name']))
   return SingleEntryR33(name,record['inode'])
 def close(self):self.closed=True;self.library=None
 def __exit__(self,*args):self.close();return False

`;

function one(value, before, after) {
 need(value.split(before).length === 2, 'R33_SINGLE_CENSUS_UNIQUE_ANCHOR_CHANGED');
 return value.replace(before, after);
}

function exitProof(value) {
 const start = value.indexOf('def pidfd_exit_proof(');
 const end = value.indexOf('def census():', start);
 need(start > 0 && end > start, 'R33_SINGLE_CENSUS_EXIT_BOUNDARY_CHANGED');
 return value.slice(start, end);
}

/** Explicit source inputs only. Missing inputs refuse without reading or importing a file. */
export function singleEntryBoundCensusR33Generate({kind = null, originalProgram = null, singleDirentSource = null} = {}) {
 need(Object.hasOwn(original, kind), 'R33_SINGLE_CENSUS_KIND_REQUIRED');
 need(typeof originalProgram === 'string' && typeof singleDirentSource === 'string', 'R33_SINGLE_CENSUS_SOURCE_INPUTS_REQUIRED');
 need(sha(originalProgram) === original[kind], 'R33_SINGLE_CENSUS_ORIGINAL_PROGRAM_CHANGED');
 need(sha(singleDirentSource) === moduleSHA256, 'R33_SINGLE_CENSUS_MODULE_CHANGED');
 need(!['def _need(', 'class SingleEntryR33:', 'class SingleEntryDirectoryR33:', 'def _linux_libc_r33(']
  .some(symbol => originalProgram.includes(symbol)), 'R33_SINGLE_CENSUS_HELPER_COLLISION');
 const proof = exitProof(originalProgram);
 need(sha(proof) === exitProofSHA256, 'R33_SINGLE_CENSUS_EXIT_PROOF_CHANGED');
 const inserted = '# BEGIN R33 SINGLE-DIRENT EXACT MODULE\n' + singleDirentSource
  + (singleDirentSource.endsWith('\n') ? '' : '\n')
  + '# END R33 SINGLE-DIRENT EXACT MODULE\n' + adapter;
 const recipe = [
  {before: 'CLOSED_READ_SUBPHASES=set(', after: inserted + 'CLOSED_READ_SUBPHASES=set('},
  {before: '   with os.scandir(proc) as entries:',
   after: "   with SingleEntryDirectoryR33(proc,'PROC_SINGLE_GETDENTS47') as entries:"},
  {before: "    with TaggedScanner(marked('FD_SCANDIR_OPEN',lambda:os.scandir(fds))) as entries:",
   after: "    with TaggedScanner(marked('FD_SCANDIR_OPEN',lambda:SingleEntryDirectoryR33(fds,'FD_SINGLE_GETDENTS47'))) as entries:"},
 ];
 let program = originalProgram;
 for (const row of recipe) program = one(program, row.before, row.after);
 need(exitProof(program) === proof, 'R33_SINGLE_CENSUS_EXIT_PROOF_CHANGED');
 let inverse = program;
 for (const row of [...recipe].reverse()) inverse = one(inverse, row.after, row.before);
 need(inverse === originalProgram, 'R33_SINGLE_CENSUS_INVERSE_CHANGED');
 return {
  schemaVersion: 1, kind: 'r33-single-entry-bound-census-generated-preparation', program,
  generatedProgramSHA256: sha(program), generatedProgramBytes: Buffer.byteLength(program),
  originalProgramSHA256: original[kind], moduleSHA256, pidfdExitProofSHA256: sha(proof),
  inverseExactlyEqualsOriginal: true, recipe,
  sourceProtocol: {
   kind: 'r33-single-entry-bound-census-source-protocol', version: 1, scope: kind,
   acquisition: 'one getdents64 record per 47-byte read; borrowed held directory cursor',
   typedExceptionTag: 'singleDirentAcquisitionR33',
   typedExceptionValues: ['PROC_SINGLE_GETDENTS47', 'FD_SINGLE_GETDENTS47'],
   legacyFirstReadSubphasePreserved: true, pidCountLimit: 100000, fdEntryCountLimit: 100000,
   skipOnlyImplicitScandirDots: true, getfdFallback: false,
   actualSourceQualificationRef: null, mappingQualificationRef: null,
   legacyConsumerCompatible: false, wholeCensusQualified: false,
  },
  preparedOnly: true, operationalQualified: false, generatedPythonExecuted: false,
 };
}
