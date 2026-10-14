(function(global){
 'use strict';
 if(global.J12Immersive)return;
 const preference='jarvis-v12-theatre-preferences',drafts=new Map(),records=new WeakMap();
 let preferred='theatre';try{const p=JSON.parse(localStorage.getItem(preference)||'{}');if(p.mode==='control')preferred='control';}catch{}
 const state={mode:preferred,panel:null,owner:null,rendered:0,opened:0,closed:0};
 const titles={scenes:['今天想聊什么','陪伴、学习与日常，都从一句话开始。'],conversation:['此刻的对话','当前档案的会话与可以继续处理的事项。'],intent:['请求与下一步','展示公开的模拟识别与分派结果。'],text:['用文字继续','Enter 发送，Shift + Enter 换行。']};
 let current=null,returnFocus=null,clearingDraft=null,focusAfterRender=null,refreshQueued=false,destroyed=false;
 const icon=(name,size=18)=>typeof I==='function'?I(name,size):'<span aria-hidden="true">'+({close:'×',mic:'◉',chat:'▤',menu:'☰',fullscreen:'⛶',edit:'✎'}[name]||'·')+'</span>';
 const escaped=value=>typeof E==='function'?E(String(value)):String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const route=()=>typeof U!=='undefined'?U.route:null;
 const ownerKey=()=>typeof U!=='undefined'&&U.vm5?.unknown?'public':typeof S!=='undefined'?'person:'+S.profile:'public';
 const theme=()=>document.documentElement.dataset.j7Theme||'stark';
 const blocked=()=>!!(typeof U!=='undefined'&&U.overlay)||!!global.J7?.state?.layer;
 function remember(){try{localStorage.setItem(preference,JSON.stringify({mode:state.mode}));}catch{}}
 function focusReference(element){if(!element)return null;return element.id?{id:element.id}:element.dataset.j12Act?{action:element.dataset.j12Act,panel:element.dataset.panel}:element.dataset.act?{business:element.dataset.act,id:element.dataset.id}:null;}
 function locateFocus(ref){if(!ref)return null;if(ref.id)return document.getElementById(ref.id);if(ref.action)return current?.terminal.querySelector('[data-j12-act="'+CSS.escape(ref.action)+'"]'+(ref.panel?'[data-panel="'+CSS.escape(ref.panel)+'"]':''));if(ref.business)return current?.terminal.querySelector('[data-act="'+CSS.escape(ref.business)+'"]'+(ref.id?'[data-id="'+CSS.escape(ref.id)+'"]':''));return null;}
 function captureDraft(){const input=document.getElementById('vm5-input');if(!input)return;const key=input.dataset.j12Owner||state.owner||ownerKey();if(clearingDraft===key)drafts.delete(key);else drafts.set(key,input.value);if(document.activeElement===input)focusAfterRender={key,start:input.selectionStart,end:input.selectionEnd};}
 function restoreDraft(){const input=document.getElementById('vm5-input');if(!input)return;const key=ownerKey();input.dataset.j12Owner=key;input.value=drafts.get(key)||'';if(focusAfterRender?.key===key&&!blocked()&&(!state.panel||state.panel==='text')){input.focus({preventScroll:true});try{input.setSelectionRange(focusAfterRender.start,focusAfterRender.end);}catch{}}focusAfterRender=null;clearingDraft=null;}
 function savedPosition(rec,node,key){if(!node)return;const marker=document.createComment('J12 original '+key);node.before(marker);rec.nodes[key]={node,marker,hidden:node.hidden,inert:node.inert};}
 function home(rec,key,control=false){const item=rec.nodes[key];if(!item)return;item.marker.after(item.node);item.node.hidden=control?item.hidden:true;item.node.inert=control?item.inert:true;}
 function place(rec,key,parent){const item=rec.nodes[key];if(!item)return;parent.append(item.node);item.node.hidden=false;item.node.inert=false;}
 function backgroundInert(rec,active){for(const n of [rec.top,rec.film,rec.workspace,rec.world]){if(n)n.inert=active;}}
 function button(label,action,panel,ico){return '<button type="button" data-j12-act="'+action+'"'+(panel?' data-panel="'+panel+'"':'')+'>'+icon(ico||'chat',17)+'<span>'+label+'</span></button>';}
 function worldMarkup(){let stars='',rain='';for(let i=0;i<52;i++)stars+='<i style="--x:'+((i*67+11)%100)+'%;--y:'+((i*43+7)%100)+'%;--s:'+(i%7===0?2:1)+'px"></i>';for(let i=0;i<18;i++)rain+='<span style="--x:'+(i*5.9)+'%;--n:'+i+'">'+['01010011','接续 110010','NEURAL 01','問い 101001'][i%4]+'<br>00110010<br>00101<br>LINK 110</span>';return '<div class="j12-world" aria-hidden="true"><div class="j12-world-art"></div><div class="j12-stars">'+stars+'</div><div class="j12-code-sky">'+rain+'</div><div class="j12-horizon"></div><div class="j12-orbit j12-orbit-a"></div><div class="j12-orbit j12-orbit-b"></div><div class="j12-industrial"><i></i><i></i><i></i><i></i></div><svg class="j12-topography" viewBox="0 0 1600 900" preserveAspectRatio="none"><g fill="none" stroke="currentColor"><path d="M-100 688Q172 498 402 582T805 600Q1200 490 1700 668M-100 722Q184 522 407 612T815 631Q1240 514 1700 700M-100 767Q182 559 437 650T863 665Q1270 570 1700 749M-100 810Q239 619 476 699T953 725Q1286 620 1700 790"/><path d="M60 430 173 303 293 446 461 276 641 464M954 446 1100 226 1301 446 1427 315 1576 458"/></g></svg><div class="j12-world-grain"></div><div class="j12-world-edge"></div></div>';}
 function build(terminal){
  const rec={terminal,nodes:{},labels:new Map(),top:terminal.querySelector('.vm5-top'),film:terminal.querySelector('.j7-film-bar'),workspace:terminal.querySelector('.vm5-workspace'),stage:terminal.querySelector('.vm5-stage')};
  for(const [key,selector]of Object.entries({side:'.vm5-side',dialogue:'.vm5-dialogue',compose:'.vm5-compose',demo:'.vm5-demo-bar',disclosure:'.vm5-disclosure',caption:'.vm5-caption',controls:'.vm5-central-controls',phase:'.vm5-orb-label',wave:'.vm5-wave',filmTools:'.j7-film-tools'}))savedPosition(rec,terminal.querySelector(selector),key);
  terminal.classList.add('j12-terminal');terminal.insertAdjacentHTML('afterbegin',worldMarkup());rec.world=terminal.querySelector('.j12-world');
  rec.stage.insertAdjacentHTML('beforeend','<section class="j12-dock" aria-label="语音与字幕"><div class="j12-signal"></div><div class="j12-subtitles"></div><div class="j12-action-row"><div class="j12-native-controls"></div>'+button('文字','open','text','edit')+'</div><div class="j12-next" hidden><button type="button" data-j12-act="open" data-panel="conversation">'+icon('arrow',14)+'<span>有可以继续处理的事项</span><b>查看</b></button></div><nav class="j12-toolbar" aria-label="对话辅助入口">'+button('场景','open','scenes','family')+button('对话记录','open','conversation','chat')+button('识别详情','open','intent','tasks')+'<button type="button" data-j8-act="demo">'+icon('play',16)+'<span>对话特效</span></button></nav></section>');
  rec.dock=rec.stage.querySelector('.j12-dock');
  terminal.insertAdjacentHTML('beforeend','<div class="j12-shade" hidden><button class="j12-backdrop" type="button" data-j12-act="close" aria-label="关闭展开面板"></button><section class="j12-drawer" role="dialog" aria-modal="true" aria-labelledby="j12-drawer-title" tabindex="-1"><header class="j12-drawer-head"><div><small>JARVIS / CONTINUE THE CONVERSATION</small><h2 id="j12-drawer-title"></h2><p></p></div><button class="j12-drawer-close" type="button" data-j12-act="close" aria-label="关闭面板">'+icon('close',21)+'</button></header><nav class="j12-drawer-tabs" aria-label="对话面板">'+Object.entries(titles).map(([key,value])=>'<button type="button" data-j12-act="open" data-panel="'+key+'">'+value[0]+'</button>').join('')+'</nav><div class="j12-drawer-body"></div><footer class="j12-drawer-footer"><span>业务与识别结果为模拟 · 档案与权限沿用原平台</span><button type="button" data-j12-act="close">回到画面 '+icon('arrow',16)+'</button></footer></section></div>');
  rec.shade=terminal.querySelector('.j12-shade');rec.drawer=terminal.querySelector('.j12-drawer');rec.drawerBody=terminal.querySelector('.j12-drawer-body');
  const actions=rec.top?.querySelector('.vm5-top-actions');if(actions){actions.insertAdjacentHTML('beforeend','<button class="vm5-ghost j12-mode-button" type="button" data-j12-act="mode">'+icon('screen',16)+'<span>控制模式</span></button><button class="vm5-ghost j12-fullscreen-button" type="button" data-j12-act="fullscreen" title="浏览器全屏（可选）" aria-label="浏览器全屏（可选）">'+icon('fullscreen',16)+'</button>');}
  const helper=document.createElement('p');helper.className='j12-control-hint';helper.innerHTML='<span>控制模式 · 完整面板与文字输入</span><button type="button" data-j12-act="mode">'+icon('fullscreen',16)+'进入剧场沉浸</button>';rec.film?.after(helper);rec.controlHint=helper;
  records.set(terminal,rec);return rec;
 }
 function prepare(rec){
  document.body.classList.toggle('j12-theatre',state.mode==='theatre');document.body.classList.toggle('j12-control',state.mode==='control');document.body.classList.toggle('j12-large-caption',!U.vm5?.unknown&&['dad','mom'].includes(S.profile));
  rec.terminal.dataset.j12Mode=state.mode;rec.terminal.dataset.j12Owner=ownerKey();
  const control=state.mode==='control';rec.world.hidden=control;rec.dock.hidden=control;
  if(control){rec.shade.hidden=true;backgroundInert(rec,false);for(const key of Object.keys(rec.nodes))home(rec,key,true);for(const [node,html]of rec.labels)node.innerHTML=html;rec.labels.clear();rec.controlHint.hidden=false;}
  else{
   rec.controlHint.hidden=true;for(const key of ['side','dialogue','compose','demo','disclosure'])home(rec,key);
   place(rec,'phase',rec.dock.querySelector('.j12-signal'));place(rec,'wave',rec.dock.querySelector('.j12-signal'));place(rec,'caption',rec.dock.querySelector('.j12-subtitles'));place(rec,'controls',rec.dock.querySelector('.j12-native-controls'));place(rec,'filmTools',rec.dock.querySelector('.j12-toolbar'));
   const identity=rec.top?.querySelector('[data-act="v5-vm-identity"]'),consoleButton=rec.top?.querySelector('[data-act="v5-vm-console"]');
   for(const node of [identity,consoleButton])if(node&&!rec.labels.has(node))rec.labels.set(node,node.innerHTML);
   if(identity)identity.innerHTML=icon('family',17)+'<span>'+escaped(typeof U!=='undefined'&&U.vm5?.unknown?'公共身份':typeof P==='function'?P().name:'我的档案')+'</span>';
   if(consoleButton)consoleButton.innerHTML=icon('grid',17)+'<span>管理</span>';
  }
  const label=rec.terminal.querySelector('.j12-mode-button span');if(label)label.textContent=control?'剧场沉浸':'控制模式';
  rec.terminal.querySelectorAll('[data-j12-act="open"]').forEach(n=>{n.setAttribute('aria-haspopup','dialog');n.setAttribute('aria-expanded',String(state.panel===n.dataset.panel));});
  syncTheme();syncNext();
 }
 function decorate(){
  if(destroyed)return;const terminal=document.querySelector('.vm5-terminal');if(route()!=='chat'||!terminal){document.body.classList.remove('j12-theatre','j12-control','j12-drawer-open','j12-large-caption');current=null;state.panel=null;state.owner=ownerKey();return;}
  if(state.owner&&state.owner!==ownerKey()){state.panel=null;returnFocus=null;focusAfterRender=null;}
  state.owner=ownerKey();current=records.get(terminal)||build(terminal);state.rendered++;prepare(current);restoreDraft();
  if(state.panel&&state.mode==='theatre'&&!blocked())showPanel(state.panel,false);else{current.shade.hidden=true;backgroundInert(current,false);document.body.classList.remove('j12-drawer-open');}
 }
 function syncTheme(){if(!current)return;current.terminal.dataset.j12Theme=theme();const image=current.stage.querySelector('.j7-core-holder img')||current.stage.querySelector('.j7-core-holder image'),src=image?.getAttribute('src')||image?.getAttribute('href')||'';const art=current.world.querySelector('.j12-world-art');if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)){art.style.backgroundImage='url("'+src+'")';art.dataset.available='true';}else{art.style.removeProperty('background-image');delete art.dataset.available;}}
 function syncNext(){if(!current)return;const actions=current.nodes.dialogue?.node.querySelectorAll('.vm5-message:last-of-type .vm5-reply-actions .btn'),pending=typeof U!=='undefined'&&U.vm5?.phase==='awaiting',next=current.dock.querySelector('.j12-next');if(next){next.hidden=!pending&&!actions?.length;next.querySelector('span').textContent=pending?'需要你确认下一步':'可以继续这段对话';}current.terminal.querySelectorAll('[data-panel="conversation"]').forEach(n=>{const count=current.nodes.dialogue?.node.querySelectorAll('.vm5-message').length||0;n.dataset.count=count;});}
 function showPanel(panel,focus=true){
  if(!current||state.mode!=='theatre'||!titles[panel]||blocked())return false;
  const rec=current;for(const key of ['side','dialogue','compose','demo','disclosure'])home(rec,key);
  state.panel=panel;rec.drawer.dataset.panel=panel;rec.drawer.querySelector('h2').textContent=titles[panel][0];rec.drawer.querySelector('.j12-drawer-head p').textContent=titles[panel][1];
  if(panel==='scenes'){place(rec,'side',rec.drawerBody);place(rec,'demo',rec.drawerBody);place(rec,'disclosure',rec.drawerBody);}else if(panel==='text'){place(rec,'compose',rec.drawerBody);place(rec,'disclosure',rec.drawerBody);}else place(rec,'dialogue',rec.drawerBody);
  rec.shade.hidden=false;backgroundInert(rec,true);document.body.classList.add('j12-drawer-open');rec.terminal.querySelectorAll('[data-j12-act="open"]').forEach(n=>{const active=n.dataset.panel===panel;n.setAttribute('aria-expanded',String(active));n.classList.toggle('active',active);});
  if(focus){rec.drawerBody.scrollTop=0;const target=panel==='text'?document.getElementById('vm5-input'):rec.drawer.querySelector('.j12-drawer-close');target?.focus({preventScroll:true});}return true;
 }
 function open(panel='conversation'){if(!current||blocked())return false;if(!state.panel)returnFocus=focusReference(document.activeElement);state.opened++;return showPanel(panel,true);}
 function close(restoreFocus=true){if(!current||!state.panel)return false;captureDraft();state.panel=null;state.closed++;current.shade.hidden=true;backgroundInert(current,false);for(const key of ['side','dialogue','compose','demo','disclosure'])home(current,key,state.mode==='control');document.body.classList.remove('j12-drawer-open');current.terminal.querySelectorAll('[data-j12-act="open"]').forEach(n=>{n.setAttribute('aria-expanded','false');n.classList.remove('active');});if(restoreFocus&&!blocked())locateFocus(returnFocus)?.focus({preventScroll:true});returnFocus=null;focusAfterRender=null;return true;}
 function setMode(mode){if(!['theatre','control'].includes(mode)||route()!=='chat')return false;captureDraft();if(state.panel)close(false);state.mode=mode;remember();prepare(current);restoreDraft();current.terminal.querySelector('.j12-mode-button')?.focus({preventScroll:true});return true;}
 async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else if(typeof toast==='function')toast('当前浏览器不支持原生全屏，剧场画面已铺满当前窗口。');}catch{if(typeof toast==='function')toast('浏览器全屏未开启，仍可直接使用铺满窗口的剧场。');}}
 function onClick(event){const button=event.target.closest('[data-j12-act]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const action=button.dataset.j12Act;if(action==='open')open(button.dataset.panel);else if(action==='close')close();else if(action==='mode')setMode(state.mode==='theatre'?'control':'theatre');else if(action==='fullscreen')fullscreen();}
 function onInput(event){if(event.target.id==='vm5-input')drafts.set(event.target.dataset.j12Owner||ownerKey(),event.target.value);}
 function onKey(event){
  if(event.target.id==='vm5-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.target.value.trim()){clearingDraft=event.target.dataset.j12Owner||ownerKey();if(state.panel)close(false);clearingDraft=event.target.dataset.j12Owner||ownerKey();}
  if(!state.panel||!current||blocked())return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(event.key==='Tab'){const items=[...current.drawer.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')].filter(e=>!e.hidden&&!e.closest('[hidden],[inert]')&&e.getBoundingClientRect().width>0),first=items[0],last=items.at(-1);if(!items.length){event.preventDefault();current.drawer.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 }
 const previousRender=typeof render==='function'?render:null;
 const wrappedRender=function(){captureDraft();const result=previousRender?.apply(this,arguments);decorate();return result;};
 if(previousRender)render=wrappedRender;
 const previousAction=typeof handleAction==='function'?handleAction:null;
 const wrappedAction=function(action,id='',element){
  const input=document.getElementById('vm5-input');if(action==='v5-vm-send'&&input?.value.trim())clearingDraft=input.dataset.j12Owner||ownerKey();
  if(state.panel&&['v5-vm-send','v5-vm-mode','v5-vm-identity','v5-vm-identify','v5-vm-unknown','v5-vm-console','v5-vm-new-session','v5-vm-confirm-clear','v5-vm-personas','v5-vm-memory','v5-vm-listen','v5-vm-demo','v5-vm-demo-listen','v5-vm-sample','v5-vm-interrupt','nav','switch-profile'].includes(action)){const clear=clearingDraft;close(false);clearingDraft=clear;}
  const result=previousAction?.call(this,action,id,element);if(clearingDraft&&(!input?.isConnected||!input.value.trim())){drafts.delete(clearingDraft);clearingDraft=null;}return result;
 };
 if(previousAction)handleAction=wrappedAction;
 function requestRefresh(){if(refreshQueued||destroyed)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;if(route()==='chat'){syncTheme();syncNext();}});}
 const observer=new MutationObserver(requestRefresh);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-j7-theme']});
 document.addEventListener('click',onClick,true);document.addEventListener('keydown',onKey,true);document.addEventListener('input',onInput,true);
 function inspect(){const host=current?.stage.querySelector('.j7-core-holder'),r=host?.getBoundingClientRect(),button=current?.terminal.querySelector('.vm5-primary')?.getBoundingClientRect();return{mode:state.mode,panel:state.panel,owner:state.owner,theme:theme(),phase:typeof U!=='undefined'?U.vm5?.phase:null,draftLength:(drafts.get(ownerKey())||'').length,core:r?{width:r.width,height:r.height,top:r.top,bottom:r.bottom}:null,primaryBottom:button?.bottom,opened:state.opened,closed:state.closed};}
 function destroy(){if(destroyed)return;close(false);state.mode='control';if(current){prepare(current);for(const key of Object.keys(current.nodes)){const item=current.nodes[key];home(current,key,true);item.marker.remove();}current.world.remove();current.dock.remove();current.shade.remove();current.controlHint.remove();current.terminal.querySelectorAll('[data-j12-act]').forEach(e=>e.remove());current.terminal.classList.remove('j12-terminal');delete current.terminal.dataset.j12Mode;delete current.terminal.dataset.j12Owner;delete current.terminal.dataset.j12Theme;}document.body.classList.remove('j12-theatre','j12-control','j12-drawer-open','j12-large-caption');if(typeof render!=='undefined'&&render===wrappedRender)render=previousRender;if(typeof handleAction!=='undefined'&&handleAction===wrappedAction)handleAction=previousAction;observer.disconnect();document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey,true);document.removeEventListener('input',onInput,true);drafts.clear();destroyed=true;}
 global.J12Immersive={state,open,close,setMode,inspect,refresh:decorate,fullscreen,isTheatre:()=>state.mode==='theatre',destroy};
 decorate();
})(window);
