"use strict";
window.LegalGymReplay = class {
  constructor(host){this.host=host;this.timer=null;this.index=0;}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;if(this.playButton)this.playButton.textContent="自动播放";}
  render(packet){
    this.stop();this.packet=packet;this.index=0;this.host.replaceChildren();
    const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};this.make=make;
    this.steps=[{kind:"brief",title:"任务交办与原合同"}];const results=new Map(),shots=new Map();let lastCall;
    for(const e of packet.events){if(e.type==="tool_call")lastCall=e.callId;if(e.type==="tool_result")results.set(e.callId,e);if(e.type==="screenshot"&&lastCall)shots.set(lastCall,e);}
    const names={read_contract:"读取原合同",browse:"浏览案例资料",submit:"提交修订与交付"};
    for(const e of packet.events){if(e.type!=="tool_call")continue;const name=e.tool.replace("mcp__c06__","");const input=e.input||{};
      const title=name==="browse"?({home:"打开资料室",search:"查询企业",open:"查阅资料"}[input.action]||names.browse)+(input.record?" · "+input.record:""):names[name]||name;
      this.steps.push({kind:name==="submit"?"delivery":"tool",title,event:e,result:results.get(e.callId),shot:shots.get(e.callId)});
    }
    if(packet.run.status==="completed"&&packet.submission&&!this.steps.some(s=>s.kind==="delivery"))this.steps.push({kind:"delivery",title:"合同交付"});
    if(packet.run.status!=="completed"){const end=[...packet.events].reverse().find(e=>e.type==="export_error"||e.type==="run_finished");this.steps.push({kind:"outcome",title:"运行状态与结束原因",message:end?.message||"此包只包含导出时已经记录的操作，任务可能尚未结束。"});}
    const toolbar=make("div",undefined,"inline-replay-toolbar"),prev=make("button","上一步"),play=make("button","自动播放"),next=make("button","下一步"),counter=make("span");
    this.playButton=play;prev.type=play.type=next.type="button";counter.setAttribute("aria-live","polite");toolbar.append(prev,play,next,make("span","每步 2 秒","muted"),counter);
    const layout=make("div",undefined,"inline-replay-layout"),timeline=make("ol",undefined,"inline-replay-timeline"),content=make("div",undefined,"inline-replay-content");
    this.buttons=[];
    for(const [i,s] of this.steps.entries()){const li=make("li"),b=make("button",`${i+1}. ${s.title}`);b.type="button";b.onclick=()=>{this.stop();play.textContent="自动播放";this.show(i);};li.append(b);timeline.append(li);this.buttons.push(b);}
    layout.append(timeline,content);this.host.append(toolbar,layout);this.content=content;this.prev=prev;this.next=next;this.counter=counter;
    prev.onclick=()=>{this.stop();play.textContent="自动播放";this.show(this.index-1);};next.onclick=()=>{this.stop();play.textContent="自动播放";this.show(this.index+1);};
    play.onclick=()=>{if(this.timer){this.stop();play.textContent="自动播放";return;}if(this.index===this.steps.length-1)this.show(0);play.textContent="暂停";this.timer=setInterval(()=>{if(this.index===this.steps.length-1){this.stop();play.textContent="自动播放";}else this.show(this.index+1);},2000);};
    this.show(0);
  }
  show(index){
    if(!this.packet)return;this.index=Math.max(0,Math.min(this.steps.length-1,index));const s=this.steps[this.index],make=this.make,p=this.packet;
    this.content.replaceChildren(make("h3",s.title));this.prev.disabled=this.index===0;this.next.disabled=this.index===this.steps.length-1;this.counter.textContent=`步骤 ${this.index+1} / ${this.steps.length}`;
    this.buttons.forEach((b,i)=>b.setAttribute("aria-current",i===this.index?"step":"false"));
    if(s.kind==="outcome"){this.content.append(make("p",s.message,"replay-error"));return;}
    if(s.kind==="brief"){
      const task=make("details"),summary=make("summary","查看任务说明");task.append(summary,make("pre",p.task||"无任务说明"));this.content.append(task);
      for(const c of p.contract?.clauses||[])this.content.append(make("h4",c.heading),make("p",c.text));return;
    }
    if(s.result?.status==="error")this.content.append(make("p","本步工具执行失败；以下为实际错误返回。","replay-error"));
    if(s.shot){const src=p.assets["screenshots/"+s.shot.screenshot];if(src){const img=make("img");img.src=src;img.alt=s.shot.title;img.className="replay-scene-image";this.content.append(make("p",s.shot.title,"muted"),img);}}
    if(s.event){const d=make("details");d.append(make("summary","查看调用参数与返回结果"),make("pre",JSON.stringify(s.event.input,null,2)+"\n\n"+(s.result?.result||"未记录返回结果")));this.content.append(d);}
    if(s.kind==="delivery"&&s.result?.status!=="error"&&p.submission){
      const word=p.assets[p.run.document?.wordPath||"assets/c06-contract-redline.docx"];
      if(word){const a=make("a","下载本次修订合同 Word","secondary");a.href=word;a.download="c06-contract-redline.docx";this.content.append(a);}
      const pages=(p.run.document?.previewPages||[p.run.document?.previewPath]).filter(Boolean).map(k=>p.assets[k]).filter(Boolean);
      const host=make("div",undefined,"replay-word-pages");this.content.append(host);new window.LegalGymWordPager(host).update(pages);
      for(const edit of p.submission.edits||[]){const d=make("details");d.append(make("summary",`${edit.clause} · ${edit.severity}风险 · 查看条款修改`));const original=p.contract?.clauses?.find(c=>c.id===edit.clause);
        d.append(make("h4","修改前"),make("p",original?.text||""),make("h4","修改后"),make("p",edit.replacement),make("h4","风险批注"),make("p",edit.comment));
        for(const id of edit.evidenceIds||[]){const i=this.steps.findIndex(x=>x.event?.input?.record===id);if(i>=0){const b=make("button","回看证据 "+id,"secondary");b.type="button";b.onclick=()=>{this.stop();this.show(i);};d.append(b);}}
        this.content.append(d);
      }
    }
  }
};
