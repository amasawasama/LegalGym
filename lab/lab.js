"use strict";
const $=id=>document.getElementById(id);
const statuses={queued:"等待领取",running:"运行中",finalizing:"正在生成交付物",stopping:"正在停止",completed:"已完成",failed:"运行失败",stopped:"已停止",interrupted:"已中断"};
const active=status=>["queued","running","finalizing","stopping"].includes(status);
const toolNames={read_contract:"读取原合同",browse:"浏览案例资料",submit:"提交合同修订"};
let state={agents:[],runs:[]},liveRuns=[],selected=new URLSearchParams(location.search).get("run"),stream,events=[],activeRun,backend=null,mountedReplay="";
const imports=new Map(),references=new Map(),cache=new Map(),pending=new Map();
const referenceIndex=JSON.parse($("reference-index").textContent);
let referenceRequest=null,referenceLoaded=false;
const replay=new window.LegalGymReplay($("inline-replay")),wordPager=new window.LegalGymWordPager($("word-pages"));
let command="",intent="view";
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function notice(text){$("notice").textContent=text;$("notice").hidden=!text;}
async function api(path,data,method){const response=await fetch(path,method?{method}:data===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});if(!response.ok){let message="无法连接本机后端";try{message=(await response.json()).error||message;}catch{}throw Error(message);}return response.json();}
function duration(s){s=Math.max(0,Math.round(s||0));return s>=60?`${Math.floor(s/60)} 分 ${s%60} 秒`:`${s} 秒`;}
function mergeRuns(){state.runs=[...[...imports.values()].map(x=>x.run),...[...references.values()].map(x=>x.run).filter(r=>!imports.has(r.id)&&!liveRuns.some(l=>l.id===r.originalRunId)),...liveRuns];}
function updateCommand(){
  command=`python3 legalgym-agent-starter/starter.py --server ${backend?location.origin:"http://127.0.0.1:8841"}${intent==="own"?' --agent-entry adapter_template:run --name "My Legal Agent"':""}`;
  $("starter-command").textContent=command;
}
function setIntent(value){
  intent=["view","demo","own"].includes(value)?value:"view";
  for(const b of document.querySelectorAll("[data-intent]")){const on=b.dataset.intent===intent;b.setAttribute("aria-pressed",String(on));$("intent-panel-"+b.dataset.intent).hidden=!on;}
  $("runtime-controls").hidden=!backend||intent==="view";
  $("agent-choice-hint").textContent=intent==="own"?"请按 Agent 名称选择你自己启动的程序；列表也可能包含示例 Agent。":"请选择示例 Starter 连接的 Agent；这里不会自动启动或替换 Agent 程序。";
  updateCommand();
}
function setMode(live){backend=live;$("runtime-mode").textContent=live?"本机运行页":"在线参考与回放";$("open-local-lab").hidden=live;for(const b of document.querySelectorAll(".go-launch"))b.hidden=!live;$("runtime-controls").hidden=!live||intent==="view";updateCommand();}
function renderAgents(){
  const select=$("agent-select"),old=select.value,online=state.agents.filter(a=>a.online);select.replaceChildren();
  if(!backend){select.append(new Option("运行新任务请先完成上方自动配置",""));$("connection-status").textContent="参考 Replay 无需安装即可查看。若要运行新任务，请使用上方启动包准备本机环境。";}
  else if(!online.length){select.append(new Option("等待 starter 连接",""));$("connection-status").textContent="后端在线，等待独立 starter 连接。";}
  else{for(const a of online)select.append(new Option(`${a.name} · ${a.currentRun?"执行中":"可领取任务"}`,a.id));if(online.some(a=>a.id===old))select.value=old;$("connection-status").textContent=`${online.length} 个 Agent 已连接 · ${online.map(a=>a.model).join(" / ")}`;}
  updateStart();
}
function updateStart(){const a=state.agents.find(a=>a.id===$("agent-select").value);$("start-run").disabled=!backend||!a?.online||!!a.currentRun;}
function renderHistory(){
  $("run-count").textContent=state.runs.length;const list=$("run-list");list.replaceChildren();
  if(!state.runs.length){list.append(node("p","连接本机 Agent 开始运行，或从上方导入已有回放记录。","muted"));return;}
  for(const r of state.runs){const b=node("button",undefined,"history-item");b.type="button";b.setAttribute("aria-current",String(r.id===selected));b.append(node("strong",r.reference?"参考示例 · C06 合同审查":r.agentName+(r.imported?" · 已导入":"")),node("small",new Date(r.createdAt).toLocaleString("zh-CN")),node("small",r.originalRunId||r.id),node("span",`${statuses[r.status]||r.status} · ${duration(r.elapsedSeconds)}`,"history-status"));if(r.failureSummary)b.append(node("small",r.failureSummary,"history-failure"));b.onclick=()=>selectRun(r.id);list.append(b);}
}
function packetKey(run){return run.id+":"+run.eventCount+":"+(run.document?.renderedAt||"");}
function renderRun(run){
  $("tab-replay").dataset.ready=String(!active(run.status)&&run.eventCount>0);
  activeRun=run;$("empty-run").hidden=true;$("run-detail").hidden=false;$("run-id").textContent=(run.reference?"参考运行 · ":run.imported?"导入记录 · ":"")+(run.originalRunId||run.id);$("run-title").textContent=run.case;$("run-agent").textContent=`${run.agentName} · ${run.model} · ${run.agentVersion}${run.reference?" · 已完成的参考运行":run.imported?" · 本地导入，非正式评测成绩":""}`;
  $("run-status").textContent=statuses[run.status]||run.status;$("run-status").dataset.status=run.status;$("run-duration").textContent=duration(run.elapsedSeconds);$("run-calls").textContent=run.toolCalls;$("run-errors").textContent=run.toolErrors;$("run-shots").textContent=run.screenshots;
  $("failure-summary").hidden=run.status!=="failed";$("failure-summary").textContent="失败原因："+(run.failureSummary||"请展开日志中的错误详情。");
  const imported=imports.get(run.id),reference=references.get(run.id);const logs=imported?.logUrl||reference?.logUrl||run.logUrl;
  for(const id of ["raw-log","download-log"])$(id).hidden=!logs;
  $("raw-log").href=logs;$("download-log").href=logs;$("download-log").download=(run.originalRunId||run.id)+".jsonl";
  $("export-replay").href=imported?.packageUrl||reference?.packageUrl||`/api/runs/${run.id}/replay-package`;$("export-replay").download=(run.originalRunId||run.id)+".legalgym.json";
  $("stop-run").hidden=run.imported||!["queued","running","stopping"].includes(run.status);$("stop-run").disabled=run.status==="stopping";
  $("stream-status").textContent=reference?referenceLoaded?"参考记录已载入，图片按需加载":"参考记录已列出，正在加载日志":run.imported?"本地记录已导入，无需后端":active(run.status)?"实时连接中":"记录已保存，可在本页回放";
  const packet=imported?.packet||cache.get(packetKey(run));if(packet)applyPacket(packet,run);else{ $("delivery-ready").hidden=true;$("delivery-wait").hidden=false;if(!active(run.status)){if(reference)loadReferencePacket().catch(()=>{});else loadPacket(run);} }
}
function applyPacket(packet,run){
  if(selected!==run.id)return;const key=packetKey(run);
  if(mountedReplay!==key){replay.render(packet);mountedReplay=key;$("replay-message").hidden=true;}
  const word=packet.assets[packet.run.document?.wordPath||"assets/c06-contract-redline.docx"],ready=!!packet.submission&&!!word;
  $("tab-delivery").dataset.ready=String(ready);
  $("delivery-ready").hidden=!ready;$("delivery-wait").hidden=ready;
  $("delivery-wait").textContent=active(run.status)?"任务仍在执行，请先查看实时日志。":"本次未产生完整 Word 交付，可以在交互回放中检查操作与错误。";
  if(ready){$("delivery-word").href=word;const d=packet.run.document||{};const pages=(d.previewPages||[d.previewPath]).filter(Boolean).map(k=>packet.assets[k]).filter(Boolean);if(!$("panel-delivery").hidden)wordPager.update(pages);}
}
async function loadPacket(run){
  if(pending.has(run.id))return pending.get(run.id);const key=packetKey(run);
  const task=(async()=>{try{const packet=await api(`/api/runs/${run.id}/replay-data`);cache.set(key,packet);applyPacket(packet,run);}catch(e){if(selected===run.id){$("replay-message").hidden=false;$("replay-message").textContent="回放加载失败："+e.message;}}finally{pending.delete(run.id);}})();pending.set(run.id,task);return task;
}
function eventTitle(e){if(e.type==="tool_call"){const name=String(e.tool||"").replace("mcp__c06__","");if(name==="browse")return({home:"打开资料室",search:"查询企业",open:"打开资料记录"})[e.input?.action]||toolNames.browse;return toolNames[name]||name;}return({tool_result:e.status==="error"?"工具返回错误":"工具返回结果",agent_message:"Agent 进度",screenshot:"页面截图已保存",run_queued:"任务已创建",run_started:"Starter 开始执行",document_rendering:"正在生成 Word 全部页面",document_ready:"Word 页面已生成",run_finished:"运行结束",export_error:"交付检查失败",stop_requested:"请求停止"})[e.type]||e.type;}
function addEvent(e,assets){
  events.push(e);const item=node("article",undefined,"event");item.dataset.error=String(e.status==="error"||e.type==="export_error");const top=node("div",undefined,"event-top");top.append(node("strong",eventTitle(e)),node("time",new Date(e.time).toLocaleTimeString("zh-CN")));item.append(top,node("div",e.source==="agent"?"来源：Agent 自报消息":"来源：记录中的环境事件","event-source"));
  if(e.type==="tool_call"||e.type==="tool_result"){const d=node("details");d.open=e.status==="error";d.append(node("summary",e.type==="tool_call"?"查看调用参数":"查看返回内容"),node("pre",e.type==="tool_call"?JSON.stringify(e.input,null,2):e.result));item.append(d);}
  else if(e.type==="screenshot"){const src=assets?assets["screenshots/"+e.screenshot]:e.url;if(src){const shot={...e,url:src};const b=node("button",`查看截图：${e.title}`,"secondary");b.type="button";b.onclick=()=>{setTab("screens");showScreenshot(shot);$("page-records").scrollIntoView({block:"start"});};item.append(b);addScreenshot(shot);}}
  else if(e.message){if(e.message.length>280||e.type==="export_error"){const d=node("details");d.append(node("summary",e.type==="export_error"?"展开错误详情":"展开完整消息"),node("pre",e.message));item.append(d);}else item.append(node("p",e.message,"agent-text"));}
  $("event-log").append(item);if($("follow-log").checked)$("event-log").scrollTop=$("event-log").scrollHeight;
}
function addScreenshot(e){$("no-screens").hidden=true;const b=node("button",e.record||e.query||"资料室");b.type="button";b.dataset.seq=e.seq;b.onclick=()=>showScreenshot(e);$("screen-buttons").append(b);showScreenshot(e);}
function showScreenshot(e){$("screen-view").hidden=false;$("screen-image").src=e.url;$("screen-image").alt=e.title;$("screen-caption").textContent=e.title+" · "+new Date(e.capturedAt).toLocaleTimeString("zh-CN");$("screen-text").textContent=e.text;for(const b of $("screen-buttons").children)b.setAttribute("aria-pressed",String(b.dataset.seq==e.seq));}
function setTab(tab){if(tab==="screens"){tab="replay";$("page-records").open=true;}for(const b of document.querySelectorAll("[data-tab]")){const on=b.dataset.tab===tab;b.setAttribute("aria-selected",String(on));$("panel-"+b.dataset.tab).hidden=!on;}if(tab!=="replay")replay.stop();if(tab==="delivery"&&activeRun){const packet=imports.get(activeRun.id)?.packet||cache.get(packetKey(activeRun));if(packet)applyPacket(packet,activeRun);}}
function selectRun(id){
  selected=id;history.replaceState(null,"","?run="+encodeURIComponent(id));if(stream)stream.close();replay.stop();mountedReplay="";events=[];$("event-log").replaceChildren();$("inline-replay").replaceChildren();$("screen-buttons").replaceChildren();$("screen-view").hidden=true;$("no-screens").hidden=false;$("replay-message").hidden=false;
  const run=state.runs.find(r=>r.id===id);if(!run)return;setTab("log");renderRun(run);renderHistory();
  const imported=imports.get(id);if(imported){for(const e of imported.packet.events)addEvent(e,imported.packet.assets);$("event-log").scrollTop=0;return;}
  if(references.has(id)){
    const packet=cache.get(packetKey(run));
    if(packet){for(const e of packet.events)addEvent(e,packet.assets);$("event-log").scrollTop=0;}
    else loadReferencePacket().catch(()=>{});
    return;
  }
  stream=new EventSource(`/api/runs/${id}/events`);
  stream.addEventListener("update",m=>{if(selected!==id)return;const data=JSON.parse(m.data),firstUpdate=events.length===0;for(const e of data.events)if(!events.some(x=>x.seq===e.seq))addEvent(e);renderRun(data.run);if(!active(data.run.status)){stream.close();if(firstUpdate)$("event-log").scrollTop=0;}const index=liveRuns.findIndex(r=>r.id===id);if(index>=0)liveRuns[index]=data.run;mergeRuns();renderHistory();});
  stream.onerror=()=>{if(activeRun?.id===id&&active(activeRun.status))$("stream-status").textContent="连接中断，正在重连…";};
}
async function refresh(force=false){
  if(backend===false&&!force)return;
  try{const data=await api("/api/state");setMode(true);state.agents=data.agents;liveRuns=data.runs;mergeRuns();renderAgents();renderHistory();const replacement=references.has(selected)&&!imports.has(selected)?liveRuns.find(r=>r.id===references.get(selected).run.originalRunId):null;if(replacement){selectRun(replacement.id);return;}if(!selected&&state.runs.length)selectRun(state.runs[0].id);else if(selected&&!activeRun&&state.runs.some(r=>r.id===selected))selectRun(selected);else{const run=state.runs.find(r=>r.id===selected);if(run)renderRun(run);}}
  catch{setMode(false);state.agents=[];liveRuns=[];mergeRuns();renderAgents();renderHistory();}
}
function decodeAsset(value){
  const match=/^data:(image\/png|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if(!match)throw Error("回放包包含不支持的附件格式，仅接受 PNG 和 Word 数据。");
  const raw=atob(match[2]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(match[1]==="image/png"&&!(bytes[0]===137&&raw.slice(1,4)==="PNG"))throw Error("无效的 PNG 附件。");
  if(match[1]!=="image/png"&&raw.slice(0,2)!=="PK")throw Error("无效的 Word 附件。");
  return URL.createObjectURL(new Blob([bytes],{type:match[1]}));
}
async function importReplay(file,reference=false,activateView=true){
  if(file.size>64*1024*1024)throw Error("回放包不能超过 64 MB。");const packet=JSON.parse(await file.text());
  if(packet.schema!=="legalgym.replay.v1"||!packet.run||typeof packet.run.id!=="string"||!Array.isArray(packet.events)||packet.events.length>10000||!packet.assets||typeof packet.assets!=="object")throw Error("请选择 LegalGym 导出的 .legalgym.json 回放包。");
  for(const e of packet.events){if(!e||typeof e.type!=="string"||!Number.isInteger(e.seq))throw Error("回放事件格式不正确。");if(e.type==="tool_call"&&(typeof e.tool!=="string"||!e.input||typeof e.input!=="object"))throw Error("工具调用记录格式不正确。");}
  if(packet.run.document?.previewPages&&!Array.isArray(packet.run.document.previewPages))throw Error("Word 页面列表格式不正确。");
  const entries=Object.entries(packet.assets);if(entries.length>256)throw Error("回放附件数量过多。");
  const urls=[],assets=Object.create(null);
  try{for(const [key,value] of entries){if(typeof value!=="string"||!key.match(/^(screenshots|assets)\/[A-Za-z0-9_.-]+$/))throw Error("回放附件路径不正确。");const url=decodeAsset(value);assets[key]=url;urls.push(url);}}
  catch(e){for(const url of urls)URL.revokeObjectURL(url);throw e;}
  packet.assets=assets;const original=packet.run,id="import-"+original.id;
  const elapsed=(Date.parse(original.finishedAt||original.createdAt)-Date.parse(original.startedAt||original.createdAt))/1000;
  const run={...original,id,originalRunId:original.id,imported:true,reference,status:active(original.status)?"interrupted":original.status,elapsedSeconds:Math.max(0,elapsed||0),score:null};
  const logUrl=URL.createObjectURL(new Blob([packet.events.map(e=>JSON.stringify(e)).join("\n")],{type:"text/plain;charset=utf-8"})),packageUrl=URL.createObjectURL(file);urls.push(logUrl,packageUrl);
  const old=imports.get(id);if(old)for(const url of old.urls)URL.revokeObjectURL(url);
  imports.set(id,{run,packet,urls,logUrl,packageUrl});mergeRuns();selectRun(id);if(activateView)setIntent("view");notice("已在浏览器本地导入回放，无需上传云端。此记录不作为正式评测成绩。");
}
$("agent-select").onchange=updateStart;
$("start-run").onclick=async()=>{const b=$("start-run");b.disabled=true;try{notice("");const run=await api("/api/runs",{agentId:$("agent-select").value});liveRuns.unshift(run);mergeRuns();selectRun(run.id);setTab("log");await refresh();}catch(e){notice(e.message);updateStart();}};
$("stop-run").onclick=async()=>{try{renderRun(await api(`/api/runs/${selected}/stop`,{}));}catch(e){notice(e.message);}};
$("copy-command").onclick=async()=>{try{await navigator.clipboard.writeText(command);$("copy-command").textContent="已复制";setTimeout(()=>$("copy-command").textContent="复制命令",1800);}catch{notice("请直接选择并复制上方命令。");}};
$("reconnect-backend").onclick=()=>refresh(true);
$("delivery-replay").onclick=()=>{setTab("replay");const index=replay.steps?.findIndex(s=>s.kind==="delivery");if(index>=0)replay.show(index);};
$("import-replay").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{await importReplay(file);}catch(error){notice("导入失败："+error.message);}e.target.value="";};
function referenceStatus(message,retry=false){
  $("reference-loading").hidden=!message;$("reference-loading-text").textContent=message;$("retry-reference").hidden=!retry;
}
function seedReference(){
  const original=referenceIndex.run,id="import-"+original.id;
  const elapsed=(Date.parse(original.finishedAt)-Date.parse(original.startedAt||original.createdAt))/1000;
  const run={...original,id,originalRunId:original.id,reference:true,imported:true,elapsedSeconds:Math.max(0,elapsed||0),score:null};
  references.set(id,{run,packageUrl:referenceIndex.packagePath,logUrl:null});mergeRuns();renderHistory();
  return run;
}
function loadReferencePacket(){
  if(referenceRequest)return referenceRequest;
  const run=references.get("import-"+referenceIndex.run.id).run;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  referenceStatus("参考运行已列出，正在加载日志和步骤；无需下载整份回放包。");
  const request=(async()=>{
    try{
      const response=await fetch(referenceIndex.packetPath,{signal:controller.signal});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const packet=await response.json();
      if(packet.schema!=="legalgym.replay.v1"||packet.run?.id!==referenceIndex.run.id||!Array.isArray(packet.events))throw Error("参考记录格式不正确");
      const base=new URL(referenceIndex.packetPath,location.href),assetRoot=new URL("assets/",base);
      const assets=Object.create(null);
      for(const [key,path] of Object.entries(packet.assets)){
        const url=new URL(path,base);
        if(url.origin!==assetRoot.origin||!url.href.startsWith(assetRoot.href))throw Error("参考附件路径不正确");
        assets[key]=url.href;
      }
      packet.assets=assets;
      const reference=references.get(run.id);
      if(reference.logUrl)URL.revokeObjectURL(reference.logUrl);
      reference.logUrl=URL.createObjectURL(new Blob([packet.events.map(e=>JSON.stringify(e)).join("\n")],{type:"text/plain;charset=utf-8"}));
      cache.set(packetKey(run),packet);referenceLoaded=true;
      if(selected===run.id&&!imports.has(run.id)){
        events=[];$("event-log").replaceChildren();$("screen-buttons").replaceChildren();
        for(const e of packet.events)addEvent(e,assets);
        $("event-log").scrollTop=0;renderRun(run);
      }
      referenceStatus("");return packet;
    }catch(error){
      if(selected===run.id&&!imports.has(run.id))$("stream-status").textContent="参考记录仍保留，日志待重新加载";
      referenceStatus(error.name==="AbortError"?"参考日志加载超时，记录仍在；请点击重试。":"参考日志暂未加载成功："+error.message+"。记录仍在，可以重试。",true);
      throw error;
    }finally{clearTimeout(timer);referenceRequest=null;}
  })();
  referenceRequest=request;return request;
}
async function loadExample(tab="log",scroll=true){
  try{
    const existing=liveRuns.find(run=>run.id===referenceIndex.run.id);
    if(existing){selectRun(existing.id);}
    else{selectRun("import-"+referenceIndex.run.id);if(!imports.has(selected)&&!referenceLoaded)loadReferencePacket().catch(()=>{});}
    if(scroll)setIntent("view");setTab(tab);if(scroll)$("run-detail").scrollIntoView({block:"start"});
    if(existing||referenceLoaded)notice("正在查看已完成的参考运行；此操作不会启动新的模型请求。");
  }catch(error){notice("参考记录暂未加载成功，请点击“查看参考运行”重试。"+error.message);}
}
$("retry-reference").onclick=()=>loadReferencePacket().catch(()=>{});
$("load-example").onclick=()=>loadExample();
for(const b of document.querySelectorAll("[data-intent]"))b.onclick=()=>setIntent(b.dataset.intent);
$("view-environment-setup").onclick=()=>{setIntent("demo");$("intent-panel-demo").scrollIntoView({block:"start"});};
for(const b of document.querySelectorAll(".go-launch"))b.onclick=()=>{$("runtime-controls").scrollIntoView({block:"start"});$("agent-select").focus({preventScroll:true});};
const tabs=[...document.querySelectorAll("[data-tab]")];for(const b of tabs){b.onclick=()=>setTab(b.dataset.tab);b.onkeydown=e=>{let i=tabs.indexOf(b);if(e.key==="ArrowRight")i=(i+1)%tabs.length;else if(e.key==="ArrowLeft")i=(i+tabs.length-1)%tabs.length;else return;e.preventDefault();tabs[i].focus();setTab(tabs[i].dataset.tab);};}
const initialTab=new URLSearchParams(location.search).get("tab");if(["log","replay","screens","delivery"].includes(initialTab))setTab(initialTab);
setIntent("view");
const seededReference=seedReference();
if(!selected||selected===referenceIndex.run.id||!state.runs.some(r=>r.id===selected))selected=seededReference.id;
selectRun(selected);
refresh().then(()=>{const explicit=new URLSearchParams(location.search).get("example")==="1";if(explicit||backend===false)return loadExample(initialTab||"log",explicit);if(["log","replay","screens","delivery"].includes(initialTab))setTab(initialTab);});setInterval(()=>refresh(),3000);
