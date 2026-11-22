"use strict";
window.LegalGymWordPager = class {
  constructor(host) { this.host=host;this.key="";this.page=0; }
  update(pages) {
    const key=JSON.stringify(pages);if(this.key===key)return;this.key=key;this.page=0;this.host.replaceChildren();
    if(!pages.length){this.host.append(document.createTextNode("本次记录没有可用的 Word 页面预览。"));return;}
    const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
    const controls=make("div");controls.className="word-page-controls";
    const prev=make("button","上一页"),next=make("button","下一页"),counter=make("span");
    prev.type=next.type="button";counter.setAttribute("aria-live","polite");controls.append(prev,counter,next);
    const viewport=make("div");viewport.className="word-page-viewport";viewport.tabIndex=0;viewport.setAttribute("aria-label","Word 全部页面，可左右滑动或使用方向键翻页");
    for(const [i,src] of pages.entries()){
      const link=make("a");link.href=src;link.target="_blank";link.rel="noopener";link.className="word-page";link.setAttribute("aria-label",`放大查看 Word 第 ${i+1} 页`);
      const img=make("img");img.src=src;img.alt=`修订 Word 第 ${i+1} 页，共 ${pages.length} 页`;img.loading=i?"lazy":"eager";link.append(img);viewport.append(link);
    }
    const update=()=>{counter.textContent=`第 ${this.page+1} / ${pages.length} 页`;prev.disabled=this.page===0;next.disabled=this.page===pages.length-1;};
    const go=index=>{this.page=Math.max(0,Math.min(pages.length-1,index));viewport.scrollTo({left:this.page*viewport.clientWidth,behavior:"auto"});update();};
    prev.onclick=()=>go(this.page-1);next.onclick=()=>go(this.page+1);
    viewport.addEventListener("scroll",()=>{if(viewport.clientWidth){this.page=Math.round(viewport.scrollLeft/viewport.clientWidth);update();}},{passive:true});
    viewport.onkeydown=e=>{if(e.key==="ArrowRight"){e.preventDefault();go(this.page+1);}if(e.key==="ArrowLeft"){e.preventDefault();go(this.page-1);}};
    const hint=make("p","由本次 Word 文件渲染。可左右滑动、按方向键或点击翻页按钮；点击页面放大。");hint.className="muted";
    this.host.append(controls,viewport,hint);update();
  }
};
