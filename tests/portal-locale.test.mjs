import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRequire} from 'node:module';
const {makeApp,wire}=createRequire(import.meta.url)('./classroom.test.cjs');
const code=fs.readFileSync(new URL('../public/portal/i18n.js',import.meta.url),'utf8'),data=fs.readFileSync(new URL('../public/portal/locale-data.js',import.meta.url),'utf8');
function environment(saved){
 const listeners={},storage=new Map(saved?[['smartitlab.lang',saved]]:[]),nodes=[],fields=[];
 const root={querySelectorAll:s=>s==='[placeholder],[aria-label],option'?fields:[]},document={documentElement:{lang:'kk'},body:{},querySelector:s=>s==='.top'?root:null,querySelectorAll:()=>[],getElementById:()=>null,createTreeWalker:()=>{let i=0;return {nextNode:()=>nodes[i++]||null};},addEventListener:(e,f)=>{listeners[e]=f;}};
 const c={document,NodeFilter:{SHOW_TEXT:4},MutationObserver:class{constructor(cb){this.cb=cb;}observe(){}},queueMicrotask,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},addEventListener:(e,f)=>{listeners[e]=f;}};c.window=c;vm.createContext(c);
 function text(value,protectedContent=false){const node={nodeValue:value,parentElement:{closest:()=>protectedContent?{}:null}};nodes.push(node);return node;}
 vm.runInContext(data,c);vm.runInContext(code,c);return {c,storage,text,fields,listeners};
}
test('Language changes translate live UI and countdown both ways without changing user text or form values',()=>{
 const e=environment(),label=e.text('Құпиясөзді ауыстыру'),timer=e.text('Қалған уақыт: 00:59 · 1 минут'),user=e.text('Қорытынды',true),report=e.text('Менің тапсырмаларым',true);
 const attrs={placeholder:'Бос болса — шектеусіз'},input={value:'my current draft',closest:()=>null,hasAttribute:k=>k in attrs,getAttribute:k=>attrs[k],setAttribute:(k,v)=>{attrs[k]=v;}};e.fields.push(input);
 e.c.PortalLocale.setLanguage('ru');assert.equal(label.nodeValue,'Сменить пароль');assert.equal(timer.nodeValue,'Осталось времени: 00:59 · 1 минут');assert.equal(user.nodeValue,'Қорытынды');assert.equal(report.nodeValue,'Менің тапсырмаларым');assert.equal(input.value,'my current draft');assert.equal(attrs.placeholder,'Пусто — без ограничения');assert.equal(e.c.document.documentElement.lang,'ru');assert.equal(e.storage.get('smartitlab.lang'),'ru');
 e.c.PortalLocale.setLanguage('kz');assert.equal(label.nodeValue,'Құпиясөзді ауыстыру');assert.equal(timer.nodeValue,'Қалған уақыт: 00:59 · 1 минут');assert.equal(attrs.placeholder,'Бос болса — шектеусіз');assert.equal(input.value,'my current draft');
 timer.nodeValue='Қалған уақыт: 00:58 · 1 минут';e.c.PortalLocale.setLanguage('ru');assert.equal(timer.nodeValue,'Осталось времени: 00:58 · 1 минут');
});
test('A saved language persists across pages, including denied storage and unknown values',()=>{
 assert.equal(environment('ru').c.PortalLocale.getLanguage(),'ru');assert.equal(environment('bad').c.PortalLocale.getLanguage(),'kz');const e=environment();e.c.localStorage.setItem=()=>{throw Error('disabled');};assert.doesNotThrow(()=>e.c.PortalLocale.setLanguage('ru'));assert.equal(e.c.PortalLocale.getLanguage(),'ru');assert.equal(e.c.PortalLocale.translate('· Оқу'),'· Обучение');assert.equal(e.c.PortalLocale.translate('Тапсырманың'),'Тапсырманың');
});
test('Live lab language changes use the existing engine language API without restarting simulation',()=>{
 const app=makeApp(),I=wire(app);I.startSimulation();I.setSimValue(290);const before=JSON.stringify({modules:I.state.modules,trace:I.state.trace,attemptId:I.state.attemptId,startedAt:I.state.startedAt}),e=environment();e.c.SIL=app.S;e.c.PortalLocale.setLanguage('ru');assert.equal(app.S.getLang(),'ru');assert.equal(I.state.running,true);assert.equal(I.state.simValue,290);assert.equal(JSON.stringify({modules:I.state.modules,trace:I.state.trace,attemptId:I.state.attemptId,startedAt:I.state.startedAt}),before);e.c.PortalLocale.setLanguage('kz');assert.equal(app.S.getLang(),'kz');assert.equal(I.state.running,true);
});
test('Server feedback labels, errors and engine parameter messages have local Russian translations',()=>{
 const e=environment('ru'),L=e.c.PortalLocale.translate;for(const value of ['Ағымдағы құпиясөз қате.','Логин немесе құпиясөз қате.','GPIO байланыстары','Құрылғының қосылған күйі тексерілмеген.','Оқытушы бағасы (0–100)'])assert(!/[әғқңөұүіӘҒҚҢӨҰҮІ]/.test(L(value)),value);
 const [source,target]=Object.entries(e.c.SIL_PORTAL_DICTIONARY).find(([s,t])=>s.includes('{')&&t.includes('{'));const filled=source.replace(/\{\w+\}/g,'GPIO34'),expected=target.replace(/\{\w+\}/g,'GPIO34');assert.equal(L(filled),expected);
});
