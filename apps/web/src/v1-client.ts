export type V1Domain = 'inbox' | 'research' | 'projects' | 'tasks' | 'experiences';
export type V1CollectionDomain = V1Domain | 'sources' | 'books' | 'stories' | 'learning' | 'voice' | 'family' | 'memory' | 'personas' | 'machines' | 'services' | 'operations' | 'approvals' | 'settings' | 'jobs';
export const v1Prefix = (domain: V1CollectionDomain | 'releases' | 'capture-policies') => `/api/v1/${['sources','books','stories'].includes(domain)?'knowledge/':''}${domain}`;
export type V1Scope = 'personal' | 'private' | 'family' | 'company';
export interface V1Record extends Record<string, unknown> { id: string; revision: number; scope: V1Scope; ownerId: string; status: string; title?: string; name?: string }
export interface V1Event { id: string; sequence: number; at: string; domain: string; objectId: string; type: string; payload: Record<string, unknown> }
export interface V1Envelope<T> { requestId: string; version: number; data: T; events: V1Event[] }
export interface V1Collection { items: V1Record[]; nextCursor: string | null; snapshotVersion: number }
export interface V1Capabilities { phase: string; identity: {actorId: string; role: string; familyAuthentication: boolean}; domains: {domain: string; route: string; status: string; commands: string[]; unavailableCommands: string[]; description: string}[]; execution: {piChat: boolean; piConfigured: boolean; development: boolean; backgroundResearch: boolean; remoteAgents: boolean; voice: boolean; ocr: boolean} }
export interface AuthState { setupRequired: boolean; authenticated: boolean }
export interface Device { id: string; name: string; status: string; role?: string }
export class V1Error extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string, public details?:Record<string,unknown>) { super(message); this.name = 'V1Error'; }
}

/** V1 never reads or writes the demonstration store. Authentication uses the existing HttpOnly cookie. */
export async function v1Request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {...init, credentials: 'same-origin', headers: {'Content-Type': 'application/json', ...init.headers}});
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = body?.error ?? body?.failure ?? {};
    throw new V1Error(error.message || body?.message || `服务请求未完成（${response.status}）`, response.status, error.code || body?.code || 'REQUEST_FAILED', body?.requestId, error.details || body?.details);
  }
  if (!body || typeof body !== 'object') throw new V1Error('服务返回格式无效，请刷新重试。', 502, 'INVALID_RESPONSE');
  return body as T;
}
export const v1AuthState = () => v1Request<AuthState>('/api/auth/state');
export const v1Authenticate = (setup: boolean, password: string) => v1Request<{ok: boolean}>(`/api/auth/${setup ? 'setup' : 'login'}`, {method: 'POST', body: JSON.stringify({password})});
export const v1Logout = () => v1Request<{ok: boolean}>('/api/auth/logout', {method: 'POST', body: '{}'});
export const v1Capabilities = () => v1Request<V1Envelope<V1Capabilities>>('/api/v1/capabilities');
export const v1Devices = () => v1Request<Device[]>('/api/devices');
export const v1List = (domain: V1CollectionDomain, cursor?: string) => v1Request<V1Envelope<V1Collection>>(`${v1Prefix(domain)}?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
export const v1Read = (domain: V1CollectionDomain, id: string) => v1Request<V1Envelope<V1Record>>(`${v1Prefix(domain)}/${encodeURIComponent(id)}`);
export const v1Command = (domain: V1CollectionDomain, command: string, payload: Record<string, unknown>, scope: V1Scope, expectedVersion: number, commandId: string = crypto.randomUUID()) =>
  v1Request<V1Envelope<V1Record>>(`${v1Prefix(domain)}/commands/${encodeURIComponent(command)}`, {method: 'POST', body: JSON.stringify({commandId, expectedVersion, scope, payload})});
export const v1AuxList = (domain: 'releases'|'capture-policies', cursor?: string) => v1Request<V1Envelope<V1Collection>>(`/api/v1/${domain}?limit=100${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
export const v1History = (domain: V1Domain, objectId: string, afterSequence=0) => v1Request<V1Envelope<{items: V1Event[];latestSequence:number}>>(`/api/v1/events/history?domain=${domain}&objectId=${encodeURIComponent(objectId)}&afterSequence=${afterSequence}&limit=100`);
export async function v1All(domain: V1CollectionDomain|'releases'|'capture-policies'):Promise<V1Collection> {
  let cursor:string|null=null;let snapshotVersion=0;const records=new Map<string,V1Record>();const seen=new Set<string>();
  do {const response:V1Envelope<V1Collection>=await (domain==='releases'||domain==='capture-policies'?v1AuxList(domain,cursor||undefined):v1List(domain,cursor||undefined));for(const record of response.data.items)records.set(record.id,record);snapshotVersion=response.data.snapshotVersion;cursor=response.data.nextCursor;if(cursor){if(seen.has(cursor))throw new V1Error('服务分页位置重复，请刷新后重试。',502,'INVALID_CURSOR');seen.add(cursor)}}while(cursor);
  return {items:[...records.values()],nextCursor:null,snapshotVersion};
}
export async function v1AllHistory(domain:V1Domain,id:string):Promise<V1Event[]> {
  const events:V1Event[]=[];let after=0;
  for(;;){const response=await v1History(domain,id,after);const page=response.data.items;if(!page.length)break;const last=page.at(-1)!.sequence;if(last<=after)throw new V1Error('修订事件位置无效，请刷新后重试。',502,'INVALID_EVENTS');events.push(...page);after=last;if(page.length<100||after>=response.data.latestSequence)break}
  return events;
}
