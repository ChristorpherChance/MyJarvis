import {z} from 'zod';
import {RuntimeAccessError} from './identity.js';

export const weatherLocationSchema = z.object({
  id: z.string().regex(/^geonames:\d{1,12}$/), name: z.string().min(1).max(160),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  timezone: z.string().min(1).max(100).refine(isTimeZone),
  countryCode: z.string().regex(/^[A-Z]{2}$/), country: z.string().max(160),
  region: z.string().max(240),
}).strict();
export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
export type WeatherDay = {date: string; code: number|null; description: string; minimumC: number|null; maximumC: number|null; rainProbabilityPercent: number|null};
export type WeatherForecast = {
  location: WeatherLocation; timezone: string; utcOffsetSeconds: number;
  current: {validAt: string; temperatureC: number|null; feelsLikeC: number|null; humidityPercent: number|null;
    windKmh: number|null; code: number|null; description: string; isDay: boolean|null};
  days: WeatherDay[];
  source: {provider: string; name: string; url: string; attribution: string; dataKind: 'weather-model'; modelUpdatedAt: null};
};
export interface WeatherProvider {
  readonly id: string;
  search(query: string, countryCode: string|undefined, signal: AbortSignal, timeoutMs: number): Promise<WeatherLocation[]>;
  forecast(location: WeatherLocation, signal: AbortSignal, timeoutMs: number): Promise<WeatherForecast>;
}

function isTimeZone(value: string) {try {new Intl.DateTimeFormat('en', {timeZone:value}).format(); return true;} catch {return false;}}
const descriptions: Record<number,string> = {0:'晴',1:'大部晴朗',2:'局部多云',3:'阴',45:'雾',48:'冻雾',51:'小毛毛雨',53:'毛毛雨',55:'强毛毛雨',56:'轻冻毛毛雨',57:'强冻毛毛雨',61:'小雨',63:'雨',65:'大雨',66:'轻冻雨',67:'强冻雨',71:'小雪',73:'雪',75:'大雪',77:'雪粒',80:'小阵雨',81:'阵雨',82:'强阵雨',85:'小阵雪',86:'强阵雪',95:'雷雨',96:'雷雨伴小冰雹',99:'雷雨伴强冰雹'};
export function weatherDescription(code: number|null) {return code===null?'暂无数据':descriptions[code]??`天气代码 ${code}`;}
function invalid(): never {throw new RuntimeAccessError('WEATHER_INVALID_RESPONSE','天气服务返回的数据不完整或格式不正确',502);}
const measurement = (min: number,max: number) => z.number().finite().min(min).max(max).nullable();
const geoRaw = z.object({results:z.array(z.object({id:z.number().int().positive().max(999999999999),name:z.string().min(1).max(160),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),timezone:z.string().refine(isTimeZone),country_code:z.string().regex(/^[A-Z]{2}$/),country:z.string().max(160).optional(),admin1:z.string().max(160).optional(),admin2:z.string().max(160).optional()})).max(20).optional()});
const forecastRaw = z.object({timezone:z.string().refine(isTimeZone),utc_offset_seconds:z.number().int().min(-50400).max(50400),
  current_units:z.object({time:z.literal('unixtime'),temperature_2m:z.literal('°C'),apparent_temperature:z.literal('°C'),relative_humidity_2m:z.literal('%'),wind_speed_10m:z.literal('km/h')}),
  current:z.object({time:z.number().int().min(1).max(4102444800),temperature_2m:measurement(-100,70),apparent_temperature:measurement(-130,100),relative_humidity_2m:measurement(0,100),wind_speed_10m:measurement(0,500),weather_code:measurement(0,999),is_day:z.union([z.literal(0),z.literal(1),z.null()])}),
  daily_units:z.object({time:z.literal('unixtime'),temperature_2m_max:z.literal('°C'),temperature_2m_min:z.literal('°C'),precipitation_probability_max:z.literal('%')}),
  daily:z.object({time:z.array(z.number().int().min(1).max(4102444800)).length(7),weather_code:z.array(measurement(0,999)).length(7),temperature_2m_max:z.array(measurement(-100,70)).length(7),temperature_2m_min:z.array(measurement(-100,70)).length(7),precipitation_probability_max:z.array(measurement(0,100)).length(7)})});

/** Production URLs are constants. The injectable fetch is only a server-side transport seam for deterministic tests. */
export class OpenMeteoProvider implements WeatherProvider {
  readonly id='open-meteo';
  constructor(private readonly transport: typeof fetch = fetch) {}
  private async json(url: URL, signal: AbortSignal, timeoutMs: number): Promise<unknown> {
    if(!['https://api.open-meteo.com','https://geocoding-api.open-meteo.com'].includes(url.origin)) invalid();
    const timeout=AbortSignal.timeout(timeoutMs), combined=AbortSignal.any([signal,timeout]);
    try {
      const response=await this.transport(url,{signal:combined,redirect:'error',headers:{accept:'application/json'}});
      if(!response.ok) throw new RuntimeAccessError('WEATHER_PROVIDER_UNAVAILABLE',`天气服务暂时不可用（HTTP ${response.status}）`,502);
      const length=Number(response.headers.get('content-length')??0);
      if(length>512*1024) invalid();
      if(!response.body) invalid();
      const reader=response.body.getReader(); let size=0; const chunks: Uint8Array[]=[];
      try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>512*1024){await reader.cancel();invalid();}chunks.push(value);}}
      finally {reader.releaseLock();}
      try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {invalid();}
    } catch(error) {
      if(signal.aborted) throw new RuntimeAccessError('WEATHER_CANCELLED','天气查询已取消',499);
      if(timeout.aborted) throw new RuntimeAccessError('WEATHER_TIMEOUT','天气查询超时，请稍后重试',504);
      if(error instanceof RuntimeAccessError) throw error;
      throw new RuntimeAccessError('WEATHER_PROVIDER_UNAVAILABLE','暂时无法连接天气服务',502);
    }
  }
  async search(query: string,countryCode: string|undefined,signal: AbortSignal,timeoutMs: number) {
    const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search=new URLSearchParams({name:query,count:'10',language:'zh',format:'json',...(countryCode?{countryCode}: {})}).toString();
    const parsed=geoRaw.safeParse(await this.json(url,signal,timeoutMs));if(!parsed.success)invalid();
    return (parsed.data.results??[]).map(item=>weatherLocationSchema.parse({id:`geonames:${item.id}`,name:item.name,latitude:item.latitude,longitude:item.longitude,timezone:item.timezone,countryCode:item.country_code,country:item.country??item.country_code,region:[item.admin1,item.admin2].filter(Boolean).join(' · ')}));
  }
  async forecast(location: WeatherLocation,signal: AbortSignal,timeoutMs: number): Promise<WeatherForecast> {
    location=weatherLocationSchema.parse(location);
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    // Ten weather variables total; one location and seven days remain within the free single-call calculation.
    url.search=new URLSearchParams({latitude:String(location.latitude),longitude:String(location.longitude),timezone:location.timezone,timeformat:'unixtime',forecast_days:'7',temperature_unit:'celsius',wind_speed_unit:'kmh',
      current:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'}).toString();
    const parsed=forecastRaw.safeParse(await this.json(url,signal,timeoutMs));if(!parsed.success)invalid();
    const raw=parsed.data;
    if(raw.timezone!==location.timezone||raw.daily.time.some((value,index)=>index>0&&value<=raw.daily.time[index-1]))invalid();
    const date=(epoch:number)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:raw.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(epoch*1000));return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-');};
    return {location,timezone:raw.timezone,utcOffsetSeconds:raw.utc_offset_seconds,
      current:{validAt:new Date(raw.current.time*1000).toISOString(),temperatureC:raw.current.temperature_2m,feelsLikeC:raw.current.apparent_temperature,humidityPercent:raw.current.relative_humidity_2m,windKmh:raw.current.wind_speed_10m,code:raw.current.weather_code,description:weatherDescription(raw.current.weather_code),isDay:raw.current.is_day===null?null:!!raw.current.is_day},
      days:raw.daily.time.map((epoch,index)=>({date:date(epoch),code:raw.daily.weather_code[index],description:weatherDescription(raw.daily.weather_code[index]),minimumC:raw.daily.temperature_2m_min[index],maximumC:raw.daily.temperature_2m_max[index],rainProbabilityPercent:raw.daily.precipitation_probability_max[index]})),
      source:{provider:this.id,name:'Open-Meteo',url:'https://open-meteo.com/',attribution:'Weather data by Open-Meteo.com · CC BY 4.0; locations by GeoNames',dataKind:'weather-model',modelUpdatedAt:null}};
  }
}
