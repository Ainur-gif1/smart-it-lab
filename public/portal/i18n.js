(()=>{'use strict';
const key='smartitlab.lang';let lang='kz';try{lang=localStorage.getItem(key)==='ru'?'ru':'kz';}catch{}
const dictionary=window.SIL_PORTAL_DICTIONARY||{},entries=Object.entries(dictionary).filter(([a,b])=>a!==b).sort((a,b)=>b[0].length-a[0].length),exact=new Map(entries),sources=new WeakMap(),attrs=new WeakMap();
const patterns=entries.filter(([k])=>/\{\w+\}/.test(k)).map(([k,v])=>{const names=[];const p=k.split(/(\{\w+\})/g).map(s=>/^\{/.test(s)?(names.push(s.slice(1,-1)),'(.+?)'):s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');return {re:new RegExp('^'+p+'$'),v,names};});
const phrases=entries.filter(([k])=>k.length>=2&&!k.includes('{')),byPhrase=new Map(phrases),phraseRE=phrases.length?new RegExp('(^|[^\\p{L}\\p{N}_])('+phrases.map(([k])=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?=$|[^\\p{L}\\p{N}_])','gu'):null;
function translate(text,target=lang){if(target!=='ru'||typeof text!=='string')return text;const trim=text.trim();if(exact.has(trim))return text.replace(trim,exact.get(trim));for(const p of patterns){const m=trim.match(p.re);if(m)return text.replace(trim,p.v.replace(/\{(\w+)\}/g,(s,n)=>m[p.names.indexOf(n)+1]??s));}
 // Match complete phrases and words; never replace a prefix inside another word.
 return phraseRE?text.replace(phraseRE,(_,prefix,phrase)=>prefix+byPhrase.get(phrase)):text;}
function skip(el){return !el||!!el.closest('script,style,textarea,pre,code,[data-no-translate],[data-i18n],.portal-language');}
function update(){document.documentElement.lang=lang==='ru'?'ru':'kk';const lab=!!window.SIL_PORTAL;if(!lab)document.title='SMART IT LAB — '+translate('Жеке кабинет');const roots=lab?[document.getElementById('portal-submission')]:[document.querySelector('.top'),document.querySelector('[data-portal-role]'),document.querySelector('footer')];
 for(const root of roots.filter(Boolean)){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(skip(node.parentElement))continue;let old=sources.get(node);const source=old&&old.out===node.nodeValue?old.source:node.nodeValue,out=translate(source);sources.set(node,{source,out});if(node.nodeValue!==out)node.nodeValue=out;}
 root.querySelectorAll('[placeholder],[aria-label],option').forEach(el=>{if(skip(el))return;for(const a of ['placeholder','aria-label']){if(!el.hasAttribute(a))continue;let records=attrs.get(el)||{};const current=el.getAttribute(a),old=records[a],source=old&&old.out===current?old.source:current,out=translate(source);records[a]={source,out};attrs.set(el,records);if(out!==current)el.setAttribute(a,out);}});
 root.querySelectorAll('[data-portal-date]').forEach(el=>{const d=new Date(el.dataset.portalDate);if(Number.isFinite(+d)){const out=d.toLocaleDateString(lang==='ru'?'ru-RU':'kk-KZ',{year:'numeric',month:'long',day:'numeric'});if(el.textContent!==out)el.textContent=out;}});
 }
 document.querySelectorAll('[data-portal-lang]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.portalLang===lang)));
}
function setLanguage(value){lang=value==='ru'?'ru':'kz';try{localStorage.setItem(key,lang);}catch{}if(window.SIL?.App&&window.SIL.getLang()!==lang)window.SIL.App.setLanguage(lang);update();}
function mount(target){if(!target||target.querySelector('.portal-language'))return;const box=document.createElement('div');box.className='portal-language';box.setAttribute('role','group');box.setAttribute('aria-label','Тіл / Язык');box.innerHTML='<button type="button" data-portal-lang="kz" lang="kk">ҚАЗ</button><button type="button" data-portal-lang="ru" lang="ru">РУС</button>';target.prepend(box);update();}
window.PortalLocale={translate,getLanguage:()=>lang,setLanguage,mount,update};
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-portal-lang]');if(btn)setLanguage(btn.dataset.portalLang);});
document.addEventListener('sil:lang',()=>{lang=window.SIL?.getLang()||lang;update();});
window.addEventListener('storage',e=>{if(e.key===key)setLanguage(e.newValue);});
let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;update();});});observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label']});
mount(document.querySelector('.top nav'));update();
})();
