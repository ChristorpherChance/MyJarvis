export const MAX_PROTOCOL_LINE_BYTES = 4 * 1024 * 1024;
const MAX_SUMMARY_BYTES = 20_000;
const MAX_EVENTS = 100_000;
const MAX_RETAINED_BYTES = 4 * 1024 * 1024;
const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k,stable(value[k])])) : value;

export type ProtocolEngine = 'pi-sdk'|'codex'|'claude'|'fixed';
export interface NativeProtocolResult { lines: string[]; error?: string }

/** Incremental event consumer. It keeps only bounded, protocol-relevant event data;
 * arbitrary stdout remains the caller's separately bounded diagnostic stream. */
export class AgentProtocolConsumer {
  private retained: string[] = [];
  private finalCanonical?: string;
  private finalLine?: string;
  private retainedBytes = 0;
  private eventCount = 0;
  private protocolError?: string;
  private readonly supervisor: boolean;
  private readonly engine: ProtocolEngine;
  constructor(engine: ProtocolEngine, purpose?: string) {
    this.engine = engine;
    this.supervisor = purpose === 'project-supervisor';
  }

  consume(line: string): void {
    if (this.protocolError) return;
    if (Buffer.byteLength(line, 'utf8') > MAX_PROTOCOL_LINE_BYTES) {
      this.protocolError = 'AGENT_PROTOCOL_LINE_TOO_LONG'; return;
    }
    if (++this.eventCount > MAX_EVENTS) { this.protocolError = 'AGENT_PROTOCOL_EVENT_LIMIT'; return; }
    let e: any;
    try { e = JSON.parse(line); } catch { return; }
    if (!e || typeof e !== 'object' || Array.isArray(e)) return;
    const final = this.engine === 'fixed' ? e.type === 'execution.result'
      : this.engine === 'codex' ? e.type === 'turn.completed'
      : this.engine === 'claude' ? e.type === 'result' : false;
    if (this.supervisor && this.engine === 'fixed' && final) {
      const summary = e.summary;
      if (typeof summary !== 'string' || Buffer.byteLength(summary, 'utf8') > MAX_SUMMARY_BYTES) {
        this.protocolError = 'AGENT_SUPERVISOR_PROTOCOL_INVALID'; return;
      }
      let data: any;
      try { data = JSON.parse(summary); } catch { this.protocolError = 'AGENT_SUPERVISOR_PROTOCOL_INVALID'; return; }
      const allowed = ['state','summary','question','options','recommendedOption','evidence','nextSuggestion'];
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== allowed.length || allowed.some(k => !Object.hasOwn(data,k)) ||
        !['progress','needs_decision','blocked','ready_for_review'].includes(data.state) || typeof data.summary !== 'string' || data.summary.length > 2000 ||
        typeof data.question !== 'string' || data.question.length > 1000 || !Array.isArray(data.options) || data.options.length > 10 || data.options.some((v: unknown) => typeof v !== 'string' || v.length > 500) ||
        data.recommendedOption !== null && (typeof data.recommendedOption !== 'string' || data.recommendedOption.length > 500) || !Array.isArray(data.evidence) || data.evidence.length > 30 ||
        data.evidence.some((v: any) => !v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== 2 || typeof v.path !== 'string' || v.path.length < 1 || v.path.length > 1000 || typeof v.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.sha256)) ||
        typeof data.nextSuggestion !== 'string' || data.nextSuggestion.length > 2000) {
        this.protocolError = 'AGENT_SUPERVISOR_PROTOCOL_INVALID'; return;
      }
      // Retain normalized final JSON only, not unrelated event payloads.
      e = { ...e, summary: JSON.stringify(data) };
      line = JSON.stringify(e);
    }
    if (!final) {
      // Preserve bounded native records needed by the existing usage/session parser.
      if (this.engine === 'codex' && ['thread.started','item.completed','error','turn.failed'].includes(e.type)) {
        if (e.type === 'item.completed' && e.item?.type !== 'agent_message') return;
        const compact = e.type === 'item.completed' ? {type:e.type,item:{type:'agent_message',text:typeof e.item.text==='string'?e.item.text.slice(0,MAX_SUMMARY_BYTES):''}} :
          e.type === 'thread.started' ? {type:e.type,thread_id:typeof e.thread_id==='string'?e.thread_id.slice(0,200):undefined} : {type:e.type,message:String(e.error?.message??e.message??'').slice(0,2000),error:{code:typeof e.error?.code==='string'?e.error.code.slice(0,100):undefined}};
        this.retain(JSON.stringify(compact));
      } else if (this.engine === 'claude' && (e.type === 'system' || e.type === 'assistant')) {
        if (e.type === 'system' && typeof e.session_id === 'string') this.retain(JSON.stringify({type:'system',session_id:e.session_id.slice(0,200)}));
        if (e.type === 'assistant' && e.message?.usage) {
          const u=e.message.usage, m=e.message;
          this.retain(JSON.stringify({type:'assistant',uuid:typeof e.uuid==='string'?e.uuid.slice(0,200):undefined,message:{id:typeof m.id==='string'?m.id.slice(0,200):undefined,model:typeof m.model==='string'?m.model.slice(0,200):undefined,usage:{input_tokens:u.input_tokens,output_tokens:u.output_tokens,cache_read_input_tokens:u.cache_read_input_tokens,cache_creation_input_tokens:u.cache_creation_input_tokens}}}));
        }
      }
      return;
    }
    const canonical = JSON.stringify(stable(e));
    if (this.finalCanonical !== undefined) {
      if (this.finalCanonical === canonical) return;
      this.protocolError = 'AGENT_PROTOCOL_FINAL_CONFLICT'; return;
    }
    this.finalCanonical = canonical;
    this.finalLine = JSON.stringify(e);
  }

  private retain(line: string): void {
    const size = Buffer.byteLength(line, 'utf8');
    if (this.retainedBytes + size > MAX_RETAINED_BYTES) { this.protocolError = 'AGENT_PROTOCOL_EVENT_LIMIT'; return; }
    this.retained.push(line);
    this.retainedBytes += size;
  }

  finish(): NativeProtocolResult {
    if (!this.protocolError && !this.finalLine) this.protocolError = 'AGENT_PROTOCOL_FINAL_MISSING';
    if (this.protocolError) return { lines: this.retained, error: this.protocolError };
    // Duplicate identical final events are idempotent and represented once.
    return { lines: [...this.retained, this.finalLine!] };
  }
}
