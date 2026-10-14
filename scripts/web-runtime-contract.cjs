// Independent, pure extension. Root integration registers routes before applying this helper.
const ref=name=>({$ref:'#/components/schemas/'+name});
const str=(max=200)=>({type:'string',minLength:1,maxLength:max});
const integer=(min,max)=>({type:'integer',minimum:min,maximum:max});
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const date={type:'string',format:'date-time'},url={type:'string',format:'uri',maxLength:4000},bool={type:'boolean'};
const slug={type:'string',pattern:'^[a-z0-9-]{1,50}$'};
module.exports=function applyWebRuntimeContract(contract){
 const s=contract.components.schemas;
 const meta={id:slug,name:str(100),language:{enum:['zh','en','other']},category:{enum:['general','international','science','health','technology','business']}};
 s.WebNewsFeed=obj({...meta,url:{...url,maxLength:2000},enabled:bool});
 s.WebSearchInput=obj({query:str(300),count:{...integer(1,10),default:5},language:{enum:['zh-CN','en-US'],default:'zh-CN'}},['query']);
 s.WebReadInput=obj({url,maxChars:{...integer(500,12000),default:6000}},['url']);
 s.WebNewsInput=obj({feedIds:{type:'array',maxItems:8,items:slug},query:str(300),count:{...integer(1,20),default:8},withinHours:{...integer(1,720),default:168}},[]);
 const policy={enabled:bool,searchEnabled:bool,pageReadEnabled:bool,newsEnabled:bool,provider:{const:'bing-rss'},timeoutMs:integer(1000,20000),maxBytes:integer(16384,2097152),cacheSeconds:integer(0,300),callsPerMinute:integer(1,30),dailyRequestLimit:integer(1,1000),feeds:{type:'array',minItems:1,maxItems:8,items:ref('WebNewsFeed')}};
 s.WebSettingsInput=obj({expectedVersion:integer(0,2147483647),...policy});
 s.WebSettings=obj({...policy,revision:integer(0,2147483647),notes:obj({provider:str(500),queryHistoryStored:{const:false},credentialsForwarded:{const:false},scriptsExecuted:{const:false}})});
 s.WebState=obj({enabled:bool,search:bool,read:bool,news:bool,provider:{const:'bing-rss'},providerStatus:{const:'public-rss-not-commercial-api'},newsFeeds:{type:'array',maxItems:8,items:obj(meta)},configured:{const:true},paidSearchApi:{const:false},requiresTurnConsent:bool,localOnly:bool,noQueryHistory:{const:true},limits:obj({timeoutMs:integer(1000,20000),maxBytes:integer(16384,2097152),callsPerMinute:integer(1,30),dailyRequestLimit:integer(1,1000),maxConcurrent:{const:4}}),limitations:{type:'array',items:str(1000)}});
 s.WebFeeds=obj({items:{type:'array',maxItems:8,items:ref('WebNewsFeed')},fetchedAt:date});
 const untrusted={trust:{const:'untrusted-public-source'},instruction:str(1000),cache:obj({status:{enum:['fresh','cached']},ageSeconds:integer(0,2147483647)})};
 s.WebSearchResult=obj({query:str(300),provider:{const:'bing-rss'},providerUrl:url,fetchedAt:date,results:{type:'array',maxItems:10,items:obj({title:str(300),url,summary:{type:'string',maxLength:700},publishedAt:{type:'null'},providerDate:nullable(date),providerDateRaw:nullable(str(2000))})},resultCount:integer(0,10),coverage:{const:'public-web-search-rss'},sourceDateMeaning:str(200),...untrusted});
 s.WebReadResult=obj({title:{type:'string',maxLength:4000},url,text:str(12000),truncated:bool,extraction:{enum:['static-html-text','plain-text']},publishedAt:nullable(date),publicationSource:nullable({const:'page-metadata'}),fetchedAt:date,mime:str(100),sourceUrl:url,...untrusted});
 s.WebNewsItem=obj({title:str(300),url,summary:{type:'string',maxLength:700},sourcePublishedAt:nullable(date),sourcePublishedRaw:nullable(str(2000)),sourceUpdatedAt:nullable(date),source:obj({...meta,feedUrl:url}),fetchedAt:date,publicationSource:{const:'rss-publisher-reported'},publicationVerified:{const:false},dated:bool});
 s.WebNewsResult=obj({fetchedAt:date,query:nullable(str(300)),withinHours:integer(1,720),items:{type:'array',maxItems:20,items:ref('WebNewsItem')},sourceStatus:{type:'array',maxItems:8,items:{oneOf:[obj({id:slug,name:str(100),status:{const:'fetched'},fetchedAt:date,itemCount:integer(0,100),latestPublishedAt:nullable(date)}),obj({id:slug,name:str(100),status:{const:'unavailable'},code:str(100)})]}},coverage:{const:'configured-official-or-admin-rss-only'},undatedItemsMayBeOld:bool,...untrusted});
 for(const [name,input]of [['Search','WebSearchInput'],['Read','WebReadInput'],['News','WebNewsInput']])s['Web'+name+'Request']=obj({input:ref(input),networkConsent:{type:'boolean',default:false}},['input']);
 function add(method,path,summary,body,result,member=true){contract.paths[path]??={};const operation={operationId:'web_'+method+'_'+path.split('/').slice(3).join('_'),summary,tags:['PublicWeb'],'x-implementation-status':'implemented',security:member?[{MemberCookie:[]},{SessionCookie:[]}]:[{SessionCookie:[]}],responses:{200:{description:'Actual external data with dates and source URLs, or authenticated configuration',content:{'application/json':{schema:ref(result)}}},400:{description:'Strict input / unknown news source'},401:{description:'Authenticated current identity required'},403:{description:'Member network privacy / unsafe URL / admin only'},409:{description:'Configuration version changed'},413:{description:'Source body exceeds limit'},415:{description:'Unsupported source format or encoding'},422:{description:'No static readable content'},429:{description:'Bounded network request budget or concurrency'},499:{description:'Client request cancelled'},502:{description:'Source unavailable / invalid data; no fabricated results'},503:{description:'Configured feature disabled'},504:{description:'Source timeout'}}};if(body)operation.requestBody={required:true,content:{'application/json':{schema:ref(body)}}};contract.paths[path][method]=operation;}
 add('get','/api/runtime/web/state','Authenticated member web capability and real privacy policy',null,'WebState');
 add('get','/api/runtime/web/settings','Admin versioned public web settings',null,'WebSettings',false);
 add('put','/api/runtime/web/settings','Admin replace settings under expectedVersion','WebSettingsInput','WebSettings',false);
 add('get','/api/runtime/web/feeds','Actual configured enabled public news feeds',null,'WebFeeds');
 add('post','/api/runtime/web/search','Real Bing public RSS; its date is not page publication','WebSearchRequest','WebSearchResult');
 add('post','/api/runtime/web/read','SSRF-protected public static webpage reading','WebReadRequest','WebReadResult');
 add('post','/api/runtime/web/news','Real configured RSS items with publisher date and unavailable source status','WebNewsRequest','WebNewsResult');
 return contract;
};
