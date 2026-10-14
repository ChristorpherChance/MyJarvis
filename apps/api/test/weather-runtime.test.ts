import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {Store} from '../src/store.js';
import {IdentityRuntime,RuntimeAccessError} from '../src/runtime/identity.js';
import {OpenMeteoProvider} from '../src/runtime/weather-provider.js';
import {WeatherRuntime,registerWeatherRoutes,createWeatherTools} from '../src/runtime/weather-runtime.js';

async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'jarvis-weather-')),store=new Store(directory);store.setPassword('weather-isolated-admin-passphrase');
 const token=store.createLogin(),adminCookie=`jarvis_session=${token}`,profiles=new Set(['me','wife','son']);
 const identity=new IdentityRuntime(store,{memberExists:id=>profiles.has(id),memberProfile:id=>profiles.has(id)?{id,name:id}:undefined});
 identity.setCredential('wife','123456','pin');identity.setCredential('son','987654','pin');
 const wife=identity.login('wife','123456','fixture-wife'),son=identity.login('son','987654','fixture-son'),admin=identity.requireAdmin({cookies:{jarvis_session:token}} as any);
 let clock=Date.now(),mode='ok',delay=0,forecastCalls=0,searchCalls=0;const calls:{url:string;options:RequestInit|undefined}[]=[];
 const rawGeo=(name:string)=>({results:[{id:name==='Paris'?2988507:2950159,name:name==='Paris'?'Paris':'Berlin',latitude:name==='Paris'?48.85341:52.52437,longitude:name==='Paris'?2.3488:13.41053,timezone:name==='Paris'?'Europe/Paris':'Europe/Berlin',country_code:name==='Paris'?'FR':'DE',country:name==='Paris'?'法国':'德国',admin1:name==='Paris'?'法兰西岛':'柏林'}]});
 const rawForecast=(zone:string)=>{const epoch=Math.floor(clock/1000);return {timezone:zone,utc_offset_seconds:7200,current_units:{time:'unixtime',temperature_2m:'°C',apparent_temperature:'°C',relative_humidity_2m:'%',wind_speed_10m:'km/h'},current:{time:epoch,temperature_2m:18.4,apparent_temperature:17.2,relative_humidity_2m:70,wind_speed_10m:12,weather_code:3,is_day:1},daily_units:{time:'unixtime',temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_probability_max:'%'},daily:{time:Array.from({length:7},(_,i)=>epoch+i*86400),weather_code:[3,61,0,2,3,95,null],temperature_2m_max:[20,18,22,21,20,17,null],temperature_2m_min:[12,11,13,14,12,10,null],precipitation_probability_max:[10,80,0,20,30,90,null]}};};
 const server=createServer(async(req,res)=>{const url=new URL(req.url!,'http://fixture');if(url.pathname.includes('search'))searchCalls++;else forecastCalls++;if(delay)await new Promise(r=>setTimeout(r,delay));if(res.destroyed)return;
  if(mode==='unavailable'){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":true}');return;}
  if(mode==='redirect'){res.writeHead(302,{location:'http://127.0.0.1/private-not-followed'});res.end();return;}
  res.writeHead(200,{'content-type':'application/json'});
  if(mode==='huge'){res.end(JSON.stringify({large:'x'.repeat(600*1024)}));return;}
  if(url.pathname.includes('search')){res.end(JSON.stringify(mode==='empty'?{}:rawGeo(url.searchParams.get('name')!)));return;}
  const raw=rawForecast(url.searchParams.get('timezone')!);if(mode==='invalid-units')raw.current_units.temperature_2m='°F';if(mode==='nulls')raw.current.temperature_2m=null as any;res.end(JSON.stringify(raw));
 });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const transport:typeof fetch=async(input,options)=>{const url=new URL(String(input));assert(['https://api.open-meteo.com','https://geocoding-api.open-meteo.com'].includes(url.origin));calls.push({url:String(input),options});return fetch(base+url.pathname+url.search,options);};
 const provider=new OpenMeteoProvider(transport),runtime=new WeatherRuntime(store,{authorizePrincipal:p=>identity.isPrincipalCurrent(p),provider,now:()=>clock}),app=Fastify();await app.register(cookie);registerWeatherRoutes(app,runtime,identity);await app.ready();
 async function select(principal=wife.principal,name='Berlin',scope:'own'|'family'='own'){const result=await runtime.search(principal,{query:name});const pref=runtime.preferences(principal)[scope];return runtime.savePreference(principal,{expectedVersion:pref.revision,locationId:result.locations[0].id},scope);}
 return {directory,store,identity,runtime,app,wife,son,admin,adminCookie,provider,calls,select,get forecastCalls(){return forecastCalls;},get searchCalls(){return searchCalls;},mode(value:string){mode=value;},delay(value:number){delay=value;},advance(ms:number){clock+=ms;},async close(){await app.close();runtime.close();identity.close();store.close();server.closeAllConnections();await new Promise<void>((r,reject)=>server.close(e=>e?reject(e):r()));const path=resolve(directory);assert(path.startsWith(resolve(tmpdir())+sep)&&path.includes('jarvis-weather-'));await rm(path,{recursive:true,force:true,maxRetries:5,retryDelay:100});}};
}

test('weather uses real HTTP transport with fixed provider origins, typed model times, units and seven-day forecasts',async()=>{const f=await fixture();try{
 assert.equal(f.forecastCalls,0);assert.equal(f.runtime.preferences(f.wife.principal).own.location,null);
 await f.select();const result=await f.runtime.get(f.wife.principal,{days:7});assert.equal(result.location.name,'Berlin');assert.equal(result.days.length,7);assert.equal(result.current.temperatureC,18.4);assert.equal(result.current.description,'阴');assert.equal(result.source.modelUpdatedAt,null);assert.equal(result.source.dataKind,'weather-model');assert.equal(result.cache.status,'fresh');assert.equal(result.timezone,'Europe/Berlin');assert.match(result.current.validAt,/Z$/);
 const request=new URL(f.calls.find(c=>c.url.includes('/forecast'))!.url);assert.equal(request.searchParams.get('forecast_days'),'7');assert.equal(request.searchParams.get('timeformat'),'unixtime');assert.equal(request.searchParams.get('latitude'),'52.52437');assert.equal(f.calls[0].options?.redirect,'error');assert(!f.calls.some(c=>c.url.includes('wife')));
 const invalid=await f.app.inject({method:'POST',url:'/api/runtime/family/weather/locations/search',headers:{cookie:`jarvis_member_session=${f.wife.token}`},payload:{query:'Berlin',endpoint:'http://127.0.0.1/private'}});assert.equal(invalid.statusCode,400);assert.equal(f.searchCalls,1);
 }finally{await f.close();}});

test('saved cities follow authenticated member identity and shared weather never reads private preferences',async()=>{const f=await fixture();try{
 await f.select(f.wife.principal,'Berlin');await f.select(f.son.principal,'Paris');assert.equal(f.runtime.preferences(f.wife.principal).own.location?.name,'Berlin');assert.equal(f.runtime.preferences(f.son.principal).own.location?.name,'Paris');assert(!JSON.stringify(f.runtime.preferences(f.wife.principal)).includes('Paris'));
 await assert.rejects(f.runtime.get(f.wife.principal,{scope:'family'}),e=>e instanceof RuntimeAccessError&&e.code==='WEATHER_LOCATION_REQUIRED');
 await assert.rejects(f.runtime.get(f.wife.principal,{locationId:'geonames:2988507'}),e=>e instanceof RuntimeAccessError&&e.statusCode===403);
 await f.select(f.admin,'Berlin','family');assert.equal((await f.runtime.get(f.son.principal,{scope:'family'})).location.name,'Berlin');assert.equal((await f.runtime.get(f.son.principal)).location.name,'Paris');
 const publicPreferences=await f.app.inject({url:'/api/runtime/family/weather/preferences?scope=family',headers:{cookie:`jarvis_member_session=${f.son.token}`}});assert.equal(publicPreferences.json().own.location,null);assert(!publicPreferences.body.includes('Paris'));
 await assert.rejects(f.runtime.get(f.son.principal,{scope:'family',locationId:'geonames:2988507'}),/公共天气/);
 const response=await f.app.inject({method:'PUT',url:'/api/runtime/weather/family-location',headers:{cookie:`jarvis_member_session=${f.wife.token}`},payload:{expectedVersion:1,locationId:null}});assert.equal(response.statusCode,401);
 const own=await f.app.inject({url:'/api/runtime/family/weather/preferences',headers:{cookie:`${f.adminCookie}; jarvis_member_session=${f.wife.token}`}});assert.equal(own.json().administrator,false);assert.equal(own.json().own.location.name,'Berlin');
 const forged=await f.app.inject({method:'PUT',url:'/api/runtime/family/weather/preferences',headers:{cookie:`jarvis_member_session=${f.wife.token}`},payload:{expectedVersion:1,locationId:null,profileId:'son'}});assert.equal(forged.statusCode,400);
 assert.throws(()=>f.runtime.savePreference(f.wife.principal,{expectedVersion:0,locationId:null}),/已更新/);
 }finally{await f.close();}});

test('weather cache deduplicates downloads, shows stale evidence on outage, expires honestly and disable takes effect immediately',async()=>{const f=await fixture();try{
 await f.select(f.admin,'Berlin','family');const [a,b]=await Promise.all([f.runtime.get(f.wife.principal),f.runtime.get(f.son.principal)]);assert.equal(f.forecastCalls,1);assert.equal(a.fetchedAt,b.fetchedAt);await f.runtime.get(f.son.principal);assert.equal(f.forecastCalls,1);
 f.advance(11*60_000);f.mode('unavailable');const stale=await f.runtime.get(f.wife.principal);assert.equal(stale.cache.status,'stale');assert.equal(stale.cache.reason,'WEATHER_PROVIDER_UNAVAILABLE');assert.equal(stale.fetchedAt,a.fetchedAt);assert.equal(stale.cache.ageSeconds,660);
 f.advance(120*60_000);await assert.rejects(f.runtime.get(f.wife.principal),/暂时不可用/);
 const config=f.runtime.configuration();const {revision,updatedAt,...values}=config;f.runtime.configure(f.admin,{...values,enabled:false,expectedVersion:revision});await assert.rejects(f.runtime.get(f.son.principal),/已停用/);assert.throws(()=>f.runtime.configure(f.admin,{...values,enabled:true,expectedVersion:revision}),/已更新/);
 }finally{await f.close();}});

test('identity revoke and family city withdrawal during an awaited HTTP query cannot expose an old selection',async()=>{const f=await fixture();try{
 await f.select(f.admin,'Berlin','family');f.delay(120);const pending=f.runtime.get(f.wife.principal);await new Promise(r=>setTimeout(r,30));f.identity.logout(f.wife.token);await assert.rejects(pending,e=>e instanceof RuntimeAccessError&&e.statusCode===401);
 f.advance(11*60_000);const second=f.runtime.get(f.son.principal,{scope:'family'});await new Promise(r=>setTimeout(r,30));f.runtime.savePreference(f.admin,{expectedVersion:1,locationId:null},'family');await assert.rejects(second,/共同城市/);
 }finally{await f.close();}});

test('caller cancellation is bounded and cannot cancel another member shared download',async()=>{const f=await fixture();try{
 await f.select(f.admin,'Berlin','family');f.delay(150);const controller=new AbortController(),cancelled=f.runtime.get(f.wife.principal,{},controller.signal),other=f.runtime.get(f.son.principal);setTimeout(()=>controller.abort(),30);await assert.rejects(cancelled,/取消/);assert.equal((await other).location.name,'Berlin');assert.equal(f.forecastCalls,1);
 }finally{await f.close();}});

test('provider rejects oversized, redirect, wrong units and times out, while missing measurements stay explicitly unknown',async()=>{const f=await fixture();try{
 const search=await f.runtime.search(f.wife.principal,{query:'Berlin'}),location=search.locations[0];
 for(const mode of ['huge','redirect','invalid-units']){f.mode(mode);await assert.rejects(f.provider.forecast(location,new AbortController().signal,1000),e=>e instanceof RuntimeAccessError);}
 f.mode('nulls');const unknown=await f.provider.forecast(location,new AbortController().signal,1000);assert.equal(unknown.current.temperatureC,null);assert.equal(unknown.days[6].description,'暂无数据');
 f.mode('ok');f.delay(1200);await assert.rejects(f.provider.forecast(location,new AbortController().signal,1000),e=>e instanceof RuntimeAccessError&&e.code==='WEATHER_TIMEOUT');
 }finally{await f.close();}});

test('readonly Pi weather tools use the real provider and reject stale identities, arbitrary URLs and unauthenticated routes',async()=>{const f=await fixture();try{
 const tools=createWeatherTools(f.runtime,f.wife.principal),search=tools.find(tool=>tool.name==='search_weather_locations')!,get=tools.find(tool=>tool.name==='get_weather')!;
 const result=await search.execute('weather-search',{query:'Berlin'},undefined,undefined,{} as any);const locations=JSON.parse((result.content[0] as any).text).locations;
 const weather=await get.execute('weather-get',{locationId:locations[0].id,days:1},undefined,undefined,{} as any);assert.equal(JSON.parse((weather.content[0] as any).text).days.length,1);assert.equal(f.forecastCalls,1);assert.equal(f.runtime.preferences(f.wife.principal).own.location,null,'read-only query must not save a city');
 await assert.rejects(get.execute('unsafe',{url:'http://127.0.0.1/private'},undefined,undefined,{} as any));
 assert.equal((await f.app.inject({url:'/api/runtime/family/weather'})).statusCode,401);f.identity.disableCredential('wife');await assert.rejects(get.execute('revoked',{},undefined,undefined,{} as any),/身份已过期/);
 }finally{await f.close();}});

test('validated city candidates and settings survive restart; expired candidate cannot be saved, with request limits enforced server-side',async()=>{const f=await fixture();try{
 await f.select(f.wife.principal,'Berlin');const before=f.runtime.preferences(f.wife.principal);const reopened=new WeatherRuntime(f.store,{authorizePrincipal:p=>f.identity.isPrincipalCurrent(p),provider:f.provider});try{assert.deepEqual(reopened.preferences(f.wife.principal).own,before.own);}finally{reopened.close();}
 await f.runtime.search(f.son.principal,{query:'Paris'});f.advance(21*60_000);assert.throws(()=>f.runtime.savePreference(f.son.principal,{expectedVersion:0,locationId:'geonames:2988507'}),/先搜索/);
 for(let index=0;index<30;index++)await f.runtime.search(f.son.principal,{query:'Berlin'});await assert.rejects(f.runtime.search(f.son.principal,{query:'Berlin'}),e=>e instanceof RuntimeAccessError&&e.code==='WEATHER_QUERY_LIMIT');
 }finally{await f.close();}});
