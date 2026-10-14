/** Read bounded run/usage metadata only; never infer missing counts or open a transcript. */
import {readFile,writeFile} from 'node:fs/promises';
import {primary,python} from './managed-server-client.mjs';
const old=JSON.parse(await readFile('artifacts/voice-latency-r19/before-attempt3.json','utf8'));
const rows=JSON.parse(primary(python({from:old.startedAt,until:old.completedAt},`import sqlite3,json
c=sqlite3.connect('file:/var/lib/jarvis/data/jarvis.db?mode=ro',uri=True);c.row_factory=sqlite3.Row
rows=c.execute('''SELECT r.id runId,r.conversation_id conversationId,r.state,r.provider,r.model,r.created_at createdAt,r.ended_at endedAt,u.id usageId,u.measurement_status measurementStatus,u.input_tokens inputTokens,u.output_tokens outputTokens,u.cache_read cacheReadTokens,u.cache_write cacheWriteTokens,u.total_tokens totalTokens,u.cost_usd costUSD,u.cost_kind costKind FROM runtime_ai_runs r LEFT JOIN runtime_ai_usage u ON u.run_id=r.id WHERE r.actor_id=? AND r.scenario=? AND r.origin=? AND r.created_at>=? AND r.created_at<=? ORDER BY r.created_at,u.id''',('server-admin','family-chat','chat',p['from'],p['until'])).fetchall()
print(json.dumps([dict(r) for r in rows]))
c.close()`)));
const report={at:new Date().toISOString(),source:'Read-only runtime_ai_runs joined with runtime_ai_usage; no transcript read or modified',from:old.startedAt,until:old.completedAt,expectedRequests:old.modelRequests,uniqueRunCount:new Set(rows.map(r=>r.runId)).size,exactSyntheticConversationIdInOriginalReport:false,attribution:'Bounded-time-window records only; original failed probe did not retain its conversationId, so no false exact-identity claim',rows};
await writeFile('artifacts/voice-latency-r19/attempt3-ledger-readback.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
