import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {OpenMeteoProvider} from '../apps/api/src/runtime/weather-provider.js';
const directory=resolve('artifacts/weather-readonly-qa');
await mkdir(directory,{recursive:true});
const report:Record<string,unknown>={sampleLocation:'Berlin, Germany — official example, not the user location',startedAt:new Date().toISOString(),productionDataWrites:0,modelCalls:0,paidCalls:0,requests:[],passed:false};
const calls:{origin:string;path:string;status:number|null}[]=[];
const provider=new OpenMeteoProvider(async(input,options)=>{const url=new URL(String(input)),item={origin:url.origin,path:url.pathname,status:null as number|null};calls.push(item);const response=await fetch(input,options);item.status=response.status;return response;});
try {
 const locations=await provider.search('Berlin','DE',new AbortController().signal,15000);
 const location=locations.find(item=>item.id==='geonames:2950159');
 if(!location)throw Error('Official Berlin example city was not found; not guessing a location');
 const forecast=await provider.forecast(location,new AbortController().signal,15000);
 if(forecast.days.length!==7||forecast.source.provider!=='open-meteo')throw Error('Weather validation failed');
 Object.assign(report,{passed:true,location,forecast,fetchedAt:new Date().toISOString(),requests:calls});
} catch(error){Object.assign(report,{error:(error as Error).message,requests:calls});process.exitCode=1;}
await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,sampleLocation:report.sampleLocation,requests:calls,report:'artifacts/weather-readonly-qa/report.json',error:report.error}));
