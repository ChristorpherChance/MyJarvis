import {DatabaseSync} from 'node:sqlite';
import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {defineTool, type ToolDefinition} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import type {Store} from '../store.js';
import {IdentityRuntime, RuntimeAccessError, runtimeHandler, type RuntimePrincipal} from './identity.js';
import {OpenMeteoProvider, weatherLocationSchema, type WeatherForecast, type WeatherLocation, type WeatherProvider} from './weather-provider.js';

const locationId=z.string().regex(/^geonames:\d{1,12}$/);
export const weatherSearchSchema=z.object({query:z.string().trim().min(2).max(100),countryCode:z.string().regex(/^[A-Z]{2}$/).optional()}).strict();
export const weatherQuerySchema=z.object({scope:z.enum(['own','family']).default('own'),locationId:locationId.optional(),days:z.coerce.number().int().min(1).max(7).default(3)}).strict();
export const weatherPreferenceSchema=z.object({expectedVersion:z.number().int().nonnegative(),locationId:locationId.nullable()}).strict();
export const weatherSettingsSchema=z.object({expectedVersion:z.number().int().nonnegative(),enabled:z.boolean(),provider:z.literal('open-meteo'),cacheMinutes:z.number().int().min(5).max(60),staleMinutes:z.number().int().min(5).max(360),timeoutMs:z.number().int().min(1000).max(15000),dailyRequestLimit:z.number().int().min(50).max(2000)}).strict().refine(value=>value.staleMinutes>=value.cacheMinutes,{message:'缓存保留时间不能短于新鲜时间'});
type Settings = Omit<z.infer<typeof weatherSettingsSchema>, 'expectedVersion'> & {revision:number;updatedAt:string|null};
const defaultSettings:Settings={enabled:true,provider:'open-meteo',cacheMinutes:10,staleMinutes:120,timeoutMs:8000,dailyRequestLimit:500,revision:0,updatedAt:null};
export type WeatherResult=WeatherForecast & {selectedScope:'own'|'family';fetchedAt:string;cache:{status:'fresh'|'stale';ageSeconds:number;expiresAt:string;staleUntil:string;reason?:string}};
export interface WeatherRuntimeOptions {authorizePrincipal:(principal:RuntimePrincipal)=>boolean;provider?:WeatherProvider;now?:()=>number;}

/** All locations originate in validated provider results. Actor and scope are supplied by authenticated server context. */
export class WeatherRuntime {
  readonly db:DatabaseSync;
  private readonly provider:WeatherProvider;
  private readonly controllers=new Set<AbortController>();
  private readonly inFlight=new Map<string,Promise<{forecast:WeatherForecast;fetchedAt:string}>>();
  private closed=false;
  constructor(readonly store:Store,readonly options:WeatherRuntimeOptions) {
    this.provider=options.provider??new OpenMeteoProvider();
    if(this.provider.id!=='open-meteo')throw new Error('An explicitly registered weather provider is required');
    this.db=new DatabaseSync(store.databasePath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runtime_weather_settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_weather_preferences(owner TEXT PRIMARY KEY,location TEXT,revision INTEGER NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_weather_candidates(owner TEXT NOT NULL,id TEXT NOT NULL,location TEXT NOT NULL,expires_at INTEGER NOT NULL,PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS runtime_weather_cache(key TEXT PRIMARY KEY,value TEXT NOT NULL,fetched_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runtime_weather_budget(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
  }
  private now(){return this.options.now?.()??Date.now();}
  private assert(principal:RuntimePrincipal){if(this.closed)throw new RuntimeAccessError('WEATHER_UNAVAILABLE','天气服务已停止',503);if(!this.options.authorizePrincipal(principal))throw new RuntimeAccessError('LOGIN_REQUIRED','身份已过期，请重新登录',401);}
  private admin(principal:RuntimePrincipal){this.assert(principal);if(!principal.administrator)throw new RuntimeAccessError('ADMIN_REQUIRED','天气服务设置需要管理员权限',403);}
  private owner(principal:RuntimePrincipal){return `profile:${principal.profileId}`;}
  private transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
  configuration():Settings {const row=this.db.prepare('SELECT value FROM runtime_weather_settings WHERE id=1').get();return row?JSON.parse(String(row.value)): {...defaultSettings};}
  settings(principal:RuntimePrincipal){this.admin(principal);return {...this.configuration(),family:this.readPreference('family'),service:{name:'Open-Meteo',usage:'家庭非商业用途免费；商业使用需更换许可配置',termsUrl:'https://open-meteo.com/en/terms',attribution:'Open-Meteo.com · CC BY 4.0 / GeoNames',sends:'仅查询词或所选城市坐标；不发送成员身份、聊天或记忆'}};}
  configure(principal:RuntimePrincipal,input:unknown){
    this.admin(principal);const value=weatherSettingsSchema.parse(input);
    const settings=this.transaction(()=>{const current=this.configuration();if(value.expectedVersion!==current.revision)throw new RuntimeAccessError('VERSION_CONFLICT','天气设置已更新，请刷新后重试',409);const {expectedVersion,...payload}=value;const next={...payload,revision:current.revision+1,updatedAt:new Date(this.now()).toISOString()};this.db.prepare('INSERT INTO runtime_weather_settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(next));return next;});
    this.store.audit('weather.settings.updated',principal.actorId,{revision:settings.revision,enabled:settings.enabled});return this.settings(principal);
  }
  private readPreference(owner:string):{location:WeatherLocation|null;revision:number;updatedAt:string|null}{const row=this.db.prepare('SELECT location,revision,updated_at FROM runtime_weather_preferences WHERE owner=?').get(owner);return row?{location:row.location?weatherLocationSchema.parse(JSON.parse(String(row.location))):null,revision:Number(row.revision),updatedAt:String(row.updated_at)}:{location:null,revision:0,updatedAt:null};}
  preferences(principal:RuntimePrincipal,scope:'own'|'family'='own'){this.assert(principal);const settings=this.configuration();return {own:scope==='family'?{location:null,revision:0,updatedAt:null}:this.readPreference(this.owner(principal)),family:this.readPreference('family'),enabled:settings.enabled,provider:settings.provider,administrator:principal.administrator};}
  savePreference(principal:RuntimePrincipal,input:unknown,scope:'own'|'family'='own'){
    this.assert(principal);if(scope==='family')this.admin(principal);const value=weatherPreferenceSchema.parse(input),owner=scope==='family'?'family':this.owner(principal);
    const result=this.transaction(()=>{
      const old=this.readPreference(owner);if(value.expectedVersion!==old.revision)throw new RuntimeAccessError('VERSION_CONFLICT','城市选择已更新，请刷新后重试',409);
      let location:WeatherLocation|null=null;
      if(value.locationId){const candidate=this.db.prepare('SELECT location FROM runtime_weather_candidates WHERE owner=? AND id=? AND expires_at>?').get(this.owner(principal),value.locationId,this.now());if(candidate)location=weatherLocationSchema.parse(JSON.parse(String(candidate.location)));else if(old.location?.id===value.locationId)location=old.location;else throw new RuntimeAccessError('WEATHER_LOCATION_NOT_SELECTED','请先搜索并选择有效城市；搜索结果保留20分钟',400);}
      const updatedAt=new Date(this.now()).toISOString(),revision=old.revision+1;
      this.db.prepare('INSERT INTO runtime_weather_preferences(owner,location,revision,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET location=excluded.location,revision=excluded.revision,updated_at=excluded.updated_at').run(owner,location?JSON.stringify(location):null,revision,updatedAt);return {location,revision,updatedAt};
    });
    this.store.audit('weather.location.updated',principal.actorId,{scope,revision:result.revision,configured:!!result.location});return this.preferences(principal);
  }
  private charge(){
    const now=this.now(),configuration=this.configuration();
    this.transaction(()=>{this.db.prepare('DELETE FROM runtime_weather_budget WHERE expires_at<=?').run(now);for(const [period,limit] of [[60_000,30],[3_600_000,300],[86_400_000,configuration.dailyRequestLimit]] as const){const start=Math.floor(now/period)*period,key=`${period}:${start}`,row=this.db.prepare('SELECT count FROM runtime_weather_budget WHERE key=?').get(key);if(Number(row?.count??0)>=limit)throw new RuntimeAccessError('WEATHER_QUERY_LIMIT','天气服务查询额度已达到本机限制，请稍后重试',429);this.db.prepare('INSERT INTO runtime_weather_budget(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,start+period);}});
  }
  private enabled(){const settings=this.configuration();if(!settings.enabled)throw new RuntimeAccessError('WEATHER_DISABLED','管理员已停用天气服务',503);return settings;}
  private async request<T>(fn:(signal:AbortSignal,timeoutMs:number)=>Promise<T>,external?:AbortSignal):Promise<T>{const settings=this.enabled();this.charge();const controller=new AbortController();this.controllers.add(controller);try{return await fn(external?AbortSignal.any([controller.signal,external]):controller.signal,settings.timeoutMs);}finally{this.controllers.delete(controller);}}
  async search(principal:RuntimePrincipal,input:unknown,signal?:AbortSignal){
    this.assert(principal);const value=weatherSearchSchema.parse(input);const locations=await this.request((s,timeout)=>this.provider.search(value.query,value.countryCode,s,timeout),signal);this.assert(principal);this.enabled();
    this.transaction(()=>{this.db.prepare('DELETE FROM runtime_weather_candidates WHERE expires_at<=?').run(this.now());const insert=this.db.prepare('INSERT INTO runtime_weather_candidates(owner,id,location,expires_at) VALUES(?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET location=excluded.location,expires_at=excluded.expires_at');for(const item of locations)insert.run(this.owner(principal),item.id,JSON.stringify(weatherLocationSchema.parse(item)),this.now()+20*60_000);});
    return {locations,source:'Open-Meteo / GeoNames',selectionRequired:true as const,expiresAt:new Date(this.now()+20*60_000).toISOString()};
  }
  private resolve(principal:RuntimePrincipal,input:z.infer<typeof weatherQuerySchema>):{location:WeatherLocation;scope:'own'|'family'}{
    const own=this.readPreference(this.owner(principal)).location,family=this.readPreference('family').location;
    if(input.scope==='family'){if(input.locationId&&input.locationId!==family?.id)throw new RuntimeAccessError('WEATHER_SCOPE_DENIED','公共天气只读取家庭共同城市',403);if(!family)throw new RuntimeAccessError('WEATHER_LOCATION_REQUIRED','请由管理员设置家庭共同城市',409);return {location:family,scope:'family'};}
    if(input.locationId){if(own?.id===input.locationId)return {location:own,scope:'own'};if(family?.id===input.locationId)return {location:family,scope:'family'};const row=this.db.prepare('SELECT location FROM runtime_weather_candidates WHERE owner=? AND id=? AND expires_at>?').get(this.owner(principal),input.locationId,this.now());if(!row)throw new RuntimeAccessError('WEATHER_LOCATION_NOT_SELECTED','请先搜索该城市，不能读取其他人的城市偏好',403);return {location:weatherLocationSchema.parse(JSON.parse(String(row.location))),scope:'own'};}
    if(own)return {location:own,scope:'own'};if(family)return {location:family,scope:'family'};throw new RuntimeAccessError('WEATHER_LOCATION_REQUIRED','请先选择自己的城市或设置家庭共同城市',409);
  }
  async get(principal:RuntimePrincipal,input:unknown={},signal?:AbortSignal):Promise<WeatherResult>{
    this.assert(principal);const value=weatherQuerySchema.parse(input),selection=this.resolve(principal,value),settings=this.enabled();
    const key=JSON.stringify([settings.provider,selection.location.latitude,selection.location.longitude,selection.location.timezone]);
    const cache=this.db.prepare('SELECT value,fetched_at FROM runtime_weather_cache WHERE key=?').get(key);
    let entry=cache?{forecast:JSON.parse(String(cache.value)) as WeatherForecast,fetchedAt:String(cache.fetched_at)}:undefined;
    let staleReason:string|undefined;
    if(!entry||this.now()-Date.parse(entry.fetchedAt)>=settings.cacheMinutes*60_000){
      try {
        // A cancelled caller cannot cancel another family's shared weather download; every caller rechecks authorization afterwards.
        let pending=this.inFlight.get(key);
        if(!pending){pending=this.request((s,timeout)=>this.provider.forecast(selection.location,s,timeout)).then(forecast=>{
          if(this.closed)throw new RuntimeAccessError('WEATHER_UNAVAILABLE','天气服务已停止',503);
          const fetchedAt=new Date(this.now()).toISOString();this.db.prepare('DELETE FROM runtime_weather_cache WHERE fetched_at<?').run(new Date(this.now()-24*3_600_000).toISOString());
          this.db.prepare('INSERT INTO runtime_weather_cache(key,value,fetched_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,fetched_at=excluded.fetched_at').run(key,JSON.stringify(forecast),fetchedAt);return {forecast,fetchedAt};
        }).finally(()=>this.inFlight.delete(key));this.inFlight.set(key,pending);}
        entry=await this.wait(pending,signal);
      } catch(error){if(signal?.aborted)throw new RuntimeAccessError('WEATHER_CANCELLED','天气查询已取消',499);if(!entry||this.now()-Date.parse(entry.fetchedAt)>=settings.staleMinutes*60_000)throw error;staleReason=error instanceof RuntimeAccessError?error.code:'WEATHER_PROVIDER_UNAVAILABLE';}
    }
    this.assert(principal);this.enabled();
    if(signal?.aborted)throw new RuntimeAccessError('WEATHER_CANCELLED','天气查询已取消',499);
    // Re-read the family preference: a public view must not retain a withdrawn/shared city after an awaited call.
    const current=this.resolve(principal,value);
    if(current.location.id!==selection.location.id||current.scope!==selection.scope)throw new RuntimeAccessError('WEATHER_LOCATION_CHANGED','城市选择已更新，请重新查询',409);
    return {...entry!.forecast,location:selection.location,days:entry!.forecast.days.slice(0,value.days),selectedScope:selection.scope,fetchedAt:entry!.fetchedAt,cache:{status:staleReason?'stale':'fresh',ageSeconds:Math.max(0,Math.floor((this.now()-Date.parse(entry!.fetchedAt))/1000)),expiresAt:new Date(Date.parse(entry!.fetchedAt)+settings.cacheMinutes*60_000).toISOString(),staleUntil:new Date(Date.parse(entry!.fetchedAt)+settings.staleMinutes*60_000).toISOString(),...(staleReason?{reason:staleReason}:{})}};
  }
  private async wait<T>(pending:Promise<T>,signal?:AbortSignal){if(!signal)return pending;if(signal.aborted)throw new RuntimeAccessError('WEATHER_CANCELLED','天气查询已取消',499);return new Promise<T>((resolve,reject)=>{const abort=()=>reject(new RuntimeAccessError('WEATHER_CANCELLED','天气查询已取消',499));signal.addEventListener('abort',abort,{once:true});pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});}
  close(){if(this.closed)return;this.closed=true;for(const controller of this.controllers)controller.abort();this.db.close();}
}

export function registerWeatherRoutes(app:FastifyInstance,runtime:WeatherRuntime,identity:IdentityRuntime){
  app.get('/api/runtime/family/weather/preferences',runtimeHandler(req=>runtime.preferences(identity.principal(req),z.object({scope:z.enum(['own','family']).default('own')}).strict().parse(req.query).scope)));
  app.put('/api/runtime/family/weather/preferences',runtimeHandler(req=>runtime.savePreference(identity.principal(req),req.body)));
  app.post('/api/runtime/family/weather/locations/search',runtimeHandler(req=>runtime.search(identity.principal(req),req.body)));
  app.get('/api/runtime/family/weather',runtimeHandler(req=>runtime.get(identity.principal(req),req.query)));
  app.get('/api/runtime/weather/settings',runtimeHandler(req=>runtime.settings(identity.requireAdmin(req))));
  app.put('/api/runtime/weather/settings',runtimeHandler(req=>runtime.configure(identity.requireAdmin(req),req.body)));
  app.put('/api/runtime/weather/family-location',runtimeHandler(req=>runtime.savePreference(identity.requireAdmin(req),req.body,'family')));
}

/** No tool accepts actor IDs, coordinates, arbitrary URLs or a preference mutation. */
export function createWeatherTools(runtime:WeatherRuntime,context:RuntimePrincipal|(()=>RuntimePrincipal),forcedScope?:'family'):ToolDefinition[]{
  const principal=()=>typeof context==='function'?context():context;
  return [defineTool({name:'search_weather_locations',label:'搜索天气城市',description:'查询真实地名候选。城市有歧义时让用户选择；不猜测所在地，不保存偏好。',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},parameters:Type.Object({query:Type.String({minLength:2,maxLength:100}),countryCode:Type.Optional(Type.String({pattern:'^[A-Z]{2}$'}))},{additionalProperties:false}),
    execute:async(_id,input,signal)=>{const result=await runtime.search(principal(),input,signal);return {content:[{type:'text',text:JSON.stringify(result)}],details:{readOnly:true,provider:'open-meteo'}};}}),
    defineTool({name:'get_weather',label:'查询真实天气',description:'查询本人选择或家庭共同城市的真实天气。可使用刚搜索得到的locationId。必须注明来源、当地时区、数据时间及缓存状态。该数据来自天气模型，不代表实测，不包含气象警报；模型更新时间不可推断。未选城市时先询问用户，不编造天气。',annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true},parameters:Type.Object({scope:Type.Optional(Type.Union([Type.Literal('own'),Type.Literal('family')])),locationId:Type.Optional(Type.String({pattern:'^geonames:[0-9]{1,12}$'})),days:Type.Optional(Type.Integer({minimum:1,maximum:7}))},{additionalProperties:false}),
    execute:async(_id,input,signal)=>{const parsed=weatherQuerySchema.parse(input);const result=await runtime.get(principal(),forcedScope?{...parsed,scope:forcedScope}:parsed,signal);return {content:[{type:'text',text:JSON.stringify(result)}],details:{readOnly:true,provider:result.source.provider,fetchedAt:result.fetchedAt,cache:result.cache.status}};}})];
}
