// Pure extension: the root integration applies this to the complete contract once routes are registered.
const ref=name=>({$ref:'#/components/schemas/'+name});
const str=(max=200)=>({type:'string',minLength:1,maxLength:max});
const integer=(min,max)=>({type:'integer',minimum:min,maximum:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const date={type:'string',format:'date-time'},id={type:'string',pattern:'^geonames:[0-9]{1,12}$'};
module.exports=function applyWeatherRuntimeContract(contract){
 const s=contract.components.schemas;
 s.WeatherLocation=obj({id,name:str(160),latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180},timezone:str(100),countryCode:{type:'string',pattern:'^[A-Z]{2}$'},country:{type:'string',maxLength:160},region:{type:'string',maxLength:240}});
 s.WeatherPreference=obj({location:nullable(ref('WeatherLocation')),revision:integer(0,2147483647),updatedAt:nullable(date)});
 s.WeatherPreferences=obj({own:ref('WeatherPreference'),family:ref('WeatherPreference'),enabled:{type:'boolean'},provider:{const:'open-meteo'},administrator:{type:'boolean'}});
 s.WeatherSearchInput=obj({query:{...str(100),minLength:2},countryCode:{type:'string',pattern:'^[A-Z]{2}$'}},['query']);
 s.WeatherSearchResult=obj({locations:{type:'array',maxItems:20,items:ref('WeatherLocation')},source:{const:'Open-Meteo / GeoNames'},selectionRequired:{const:true},expiresAt:date});
 s.WeatherPreferenceInput=obj({expectedVersion:integer(0,2147483647),locationId:nullable(id)});
 const measurement=(min,max)=>nullable({type:'number',minimum:min,maximum:max});
 s.WeatherDay=obj({date:{type:'string',format:'date'},code:measurement(0,999),description:str(),minimumC:measurement(-100,70),maximumC:measurement(-100,70),rainProbabilityPercent:measurement(0,100)});
 s.WeatherResult=obj({location:ref('WeatherLocation'),timezone:str(100),utcOffsetSeconds:integer(-50400,50400),
  current:obj({validAt:date,temperatureC:measurement(-100,70),feelsLikeC:measurement(-130,100),humidityPercent:measurement(0,100),windKmh:measurement(0,500),code:measurement(0,999),description:str(),isDay:nullable({type:'boolean'})}),
  days:{type:'array',minItems:1,maxItems:7,items:ref('WeatherDay')},
  source:obj({provider:{const:'open-meteo'},name:{const:'Open-Meteo'},url:{const:'https://open-meteo.com/'},attribution:str(500),dataKind:{const:'weather-model'},modelUpdatedAt:{type:'null'}}),
  selectedScope:{enum:['own','family']},fetchedAt:date,
  cache:obj({status:{enum:['fresh','stale']},ageSeconds:integer(0,2147483647),expiresAt:date,staleUntil:date,reason:str()},['status','ageSeconds','expiresAt','staleUntil'])});
 const policy={enabled:{type:'boolean'},provider:{const:'open-meteo'},cacheMinutes:integer(5,60),staleMinutes:integer(5,360),timeoutMs:integer(1000,15000),dailyRequestLimit:integer(50,2000)};
 s.WeatherSettingsInput=obj({expectedVersion:integer(0,2147483647),...policy});
 s.WeatherSettings=obj({...policy,revision:integer(0,2147483647),updatedAt:nullable(date),family:ref('WeatherPreference'),service:obj({name:{const:'Open-Meteo'},usage:str(1000),termsUrl:{const:'https://open-meteo.com/en/terms'},attribution:str(500),sends:str(1000)})});
 function add(method,path,summary,body,result,member=false,parameters){contract.paths[path]??={};const operation={operationId:'weather_'+method+'_'+path.split('/').slice(3).join('_').replaceAll('-','_'),summary,tags:['Weather'],'x-implementation-status':'implemented',security:member?[{MemberCookie:[]},{SessionCookie:[]}]:[{SessionCookie:[]}],responses:{200:{description:'Validated live weather, explicit cache state or versioned settings',content:{'application/json':{schema:ref(result)}}},400:{description:'Strict input or unverified location'},401:{description:'Authentication expired or required'},403:{description:'Personal or family scope denied'},409:{description:'Location missing, changed or version conflict'},429:{description:'Local bounded request budget'},502:{description:'Provider unavailable or invalid response'},503:{description:'Weather disabled or server stopped'},504:{description:'Provider timeout'}}};if(body)operation.requestBody={required:true,content:{'application/json':{schema:ref(body)}}};if(parameters)operation.parameters=parameters;contract.paths[path][method]=operation;}
 const scope={name:'scope',in:'query',required:false,schema:{type:'string',enum:['own','family'],default:'own'}};
 add('get','/api/runtime/family/weather/preferences','本人城市和明确共享的家庭城市；scope=family不返回本人城市',null,'WeatherPreferences',true,[scope]);
 add('put','/api/runtime/family/weather/preferences','仅修改已登录本人的天气城市','WeatherPreferenceInput','WeatherPreferences',true);
 add('post','/api/runtime/family/weather/locations/search','固定Open-Meteo服务的城市候选；不自动选择或保存','WeatherSearchInput','WeatherSearchResult',true);
 add('get','/api/runtime/family/weather','真实天气查询；family范围不读取私有城市',null,'WeatherResult',true,[scope,{name:'locationId',in:'query',schema:id},{name:'days',in:'query',schema:{...integer(1,7),default:3}}]);
 add('get','/api/runtime/weather/settings','管理员天气策略、公共城市和使用条款',null,'WeatherSettings');
 add('put','/api/runtime/weather/settings','版本保护的固定服务策略；不接受任意URL','WeatherSettingsInput','WeatherSettings');
 add('put','/api/runtime/weather/family-location','管理员明确选择或撤回家庭共同城市','WeatherPreferenceInput','WeatherPreferences');
 return contract;
};
