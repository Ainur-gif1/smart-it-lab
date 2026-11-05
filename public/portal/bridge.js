(()=>{'use strict';const boot=window.SIL_PORTAL,a=boot.assignment,bar=document.getElementById('portal-submission');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function init(){const S=window.SIL;document.body.classList.add('portal-assigned');S.Progress.setStudentId(boot.student.displayCode);const lab=a.taskId.startsWith('iot-')?S.IotLab:S.PcBuilder;if(a.taskId.startsWith('iot-'))lab.switchProject(a.taskId);else lab.switchTask(a.taskId);lab.switchMode(a.mode);S.App.showPage(a.taskId.startsWith('iot-')?'iot':'pc');
 bar.innerHTML=`<div class="portal-row"><div><strong><span data-no-translate>${esc(a.title)}</span></strong> · <span data-no-translate>${esc(boot.student.displayCode)}</span> · ${a.mode==='exam'?'Емтихан':'Оқу'}<p>${a.instruction?'<span data-no-translate>'+esc(a.instruction)+'</span>':'Зертхананы аяқтап, қорытынды жазып, жұмысты жіберіңіз.'}</p></div><a href="/student">← Жеке кабинет</a></div><div id="portal-timer" role="timer" aria-live="off"></div><button id="portal-time-retry" type="button" hidden>Уақытты қайта жүктеу</button><div class="portal-row"><button id="portal-report" type="button">Қорытынды</button><button id="portal-send" type="button">Оқытушыға жіберу</button></div><a id="portal-result-link" href="/student" hidden>Нәтижені көру →</a><p id="portal-submit-status" role="status" aria-live="polite"></p>`;
 window.PortalLocale?.mount(bar);
 const status=document.getElementById('portal-submit-status');
 const timer=document.getElementById('portal-timer'),retry=document.getElementById('portal-time-retry'),main=document.getElementById('main');
 let currentAttemptId=null,timing=null,timingReady=a.timeLimitMinutes===undefined,clockAnchor=null,expiryAnnounced=false,expiring=false,expiryBusy=false,saveBusy=false,restored=false,lastSaved="",ticks=0,submitted=false,sending=false,stoppedAt=null,ticker=null;
 const monotonic=()=>window.performance?window.performance.now():Date.now();
 const serverNow=()=>submitted&&stoppedAt!==null?stoppedAt:clockAnchor?clockAnchor.server+monotonic()-clockAnchor.local:Date.now();
 function expired(){return timing?.deadlineAt!=null&&serverNow()>=timing.deadlineAt;}
 function lockTask(data={},message='Тапсырма оқытушыға жіберілді. Уақыт тоқтатылды. Қайта жалғастыруға болмайды.'){
  submitted=true;stoppedAt=data.submittedAt?Date.parse(data.submittedAt):serverNow();
  if(ticker!==null){clearInterval(ticker);ticker=null;}
  if(S.IotLab.state.running)S.IotLab.stopSimulation();
  if(main){main.inert=true;main.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);}
  document.body.classList.add('portal-submitted');retry.hidden=true;
  const link=document.getElementById('portal-result-link');link.href='/student'+(data.id||data.submissionId?'#submission-'+encodeURIComponent(data.id||data.submissionId):'');link.hidden=false;
  document.getElementById('portal-send').textContent='Тапсырылды';status.textContent=message;tick();
 }
 function freeze(){if(main)main.inert=true;document.getElementById('portal-send').disabled=true;document.getElementById('portal-report').disabled=true;}
 function work(){const st=lab.state,previous=S.Progress.attempts().find(x=>x.id===st.attemptId);return {id:st.attemptId,taskId:a.taskId,mode:a.mode,mistakes:st.mistakes||0,hints:st.hints||0,timeSec:Math.max(0,Math.round(((st.endedAt||Date.now())-st.startedAt)/1000)),finished:!!(st.finished||st.completed||st.recorded),snapshot:a.taskId.startsWith('iot-')?{type:'iot',controller:st.controller,modules:st.modules.map(x=>({...x})),values:st.trace.slice()}:{type:'pc',build:{...st.build},launched:!!st.recorded},report:previous?.report||{evidence:'',fixes:'',conclusion:''}};}
 async function checkpoint(){if(!timingReady||!timing||submitted||expiring||sending||saveBusy||!a.id)return;const attempt=work();if(!attempt.id)return;const serialized=JSON.stringify(attempt);if(serialized===lastSaved)return;saveBusy=true;try{const r=await fetch('/api/student/assignments/'+encodeURIComponent(a.id)+'/draft',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({attempt})});const data=await r.json();if(r.ok){lastSaved=serialized;if(data.submitted)lockTask(data);} }catch{}finally{saveBusy=false;}}
 function restoreDraft(draft){if(restored)return;restored=true;if(!draft?.revision||!draft.attempt?.snapshot)return;const d=draft.attempt,st=lab.state,snap=d.snapshot;st.attemptId=d.id;st.mistakes=d.mistakes;st.hints=d.hints;st.startedAt=Date.now()-d.timeSec*1000;if(snap.type==='pc'){st.build={...snap.build};st.recorded=!!snap.launched;st.finished=!!snap.launched;}else{st.controller=snap.controller;st.modules=snap.modules.map(x=>({...x}));st.trace=snap.values.slice();if(st.trace.length)st.simValue=st.trace[st.trace.length-1];st.completed=!!d.finished;st.finished=!!d.finished;st.running=false;st.checked=false;st.lastCheck=null;}lab.render();if(d.finished){S.Progress.recordAttempt(a.taskId,{...d,attemptId:d.id,score:0,completed:false});S.Progress.saveReport(d.id,d.report);}refresh();}
 async function autoSubmit(){if(submitted||expiryBusy)return;expiring=true;freeze();if(S.IotLab.state.running)S.IotLab.stopSimulation();expiryBusy=true;status.textContent='Уақыт аяқталды. Жұмыс автоматты түрде жіберілуде…';try{const r=await fetch('/api/student/assignments/'+encodeURIComponent(a.id)+'/expire',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:'{}'});const data=await r.json();if(!r.ok)throw Error(data.error||'Байланыс жоқ');lockTask(data,'Уақыт аяқталды. Жұмыс оқытушыға автоматты тапсырылды. Қайта жалғастыруға болмайды.');}catch{status.textContent='Уақыт аяқталды. Жұмыс жабылды. Байланыс қалпына келгенде соңғы сақталған нұсқа автоматты тапсырылады.';}finally{expiryBusy=false;}}
 function tick(){
  if(submitted){document.getElementById('portal-send').disabled=true;document.getElementById('portal-report').disabled=true;timer.textContent='Уақыт тоқтатылды';return;}
  const closed=expired()||expiring;
  document.getElementById('portal-send').disabled=!currentAttemptId||!timingReady||closed||sending;
  document.getElementById('portal-report').disabled=!currentAttemptId||sending||closed;
  timer.classList.toggle('is-expired',expired());
  if(!timingReady){timer.textContent='Уақыт жүктелуде…';return;}
  if(!timing||timing.deadlineAt===null){timer.textContent='Уақыт шектеусіз';return;}
  const left=Math.max(0,Math.ceil((timing.deadlineAt-serverNow())/1000));
  timer.textContent='Қалған уақыт: '+String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0')+' · '+timing.timeLimitMinutes+' минут';
  if(expired()||expiring){autoSubmit();return;}if(++ticks%2===0)checkpoint();
 }
 async function syncTiming(start){
  if(submitted)return;
  retry.hidden=true;
  try{
   const response=await fetch('/api/student/assignments/'+encodeURIComponent(a.id)+'/'+(start?'start':'timing'),{method:start?'POST':'GET',headers:start?{'Content-Type':'application/json'}:{},body:start?'{}':undefined,credentials:'same-origin',cache:'no-store'});
   const data=await response.json();if(submitted)return;if(!response.ok)throw Object.assign(Error(data.error||'Уақытты жүктеу орындалмады.'),{code:data.code});
   if(!data.timing)throw Error('Тапсырманы бастау қажет.');
   if(data.timing.submitted){lockTask(data.timing);return;}
   timing=data.timing;restoreDraft(data.draft);clockAnchor={server:timing.serverNow,local:monotonic()};timingReady=true;if(main&&!sending&&!submitted&&!expiring)main.inert=false;tick();
  }catch(error){if(submitted)return;if(error.code==='assignment_submitted'){lockTask({},error.message);return;}status.textContent=error.message;retry.hidden=false;tick();}
 }
 retry.onclick=()=>syncTiming(true);
 if(a.timeLimitMinutes!==undefined){if(main)main.inert=true;syncTiming(true);ticker=setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&timingReady)syncTiming(false);});}

 function latestAttempt(){const attempts=S.Progress.attempts().filter(x=>x.taskId===a.taskId&&x.mode===a.mode&&x.snapshot);return attempts[attempts.length-1];}
 function refresh(){if(submitted){tick();return;}const previous=currentAttemptId;currentAttemptId=latestAttempt()?.id||null;if(currentAttemptId&&currentAttemptId!==previous){submitted=false;expiryAnnounced=false;status.textContent='';}document.getElementById('portal-report').disabled=!currentAttemptId;tick();}
 document.getElementById('portal-report').onclick=()=>{if(submitted||expiring)return;const attempt=latestAttempt();if(attempt){S.Reports.open(attempt.id);S.App.showPage('report');}};
 document.getElementById('portal-send').onclick=async function(){if(submitted||sending||expiring)return;const attempt=latestAttempt();if(!attempt)return;if(!timingReady){status.textContent='Алдымен тапсырманың уақытын жүктеңіз.';return;}if(expired()){tick();return;}if(!attempt.report?.conclusion?.trim()){status.textContent='«Қорытынды» бөлімін толтырыңыз.';return;}sending=true;if(main)main.inert=true;tick();status.textContent='Жұмыс серверге жіберілуде…';try{const r=await fetch('/api/student/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignmentId:a.id,attempt})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Жіберу орындалмады.'),{code:data.code});lockTask(data,data.isLate?'Жұмыс «Кеш тапсырылды» белгісімен жіберілді. Уақыт тоқтатылды. Қайта жалғастыруға болмайды.':undefined);}catch(e){if(e.code==='assignment_submitted')lockTask({},e.message);else status.textContent='Жұмыс жіберілмеді: '+e.message;}finally{sending=false;if(main&&!submitted&&!expiring&&timingReady)main.inert=false;tick();}};
 document.addEventListener('sil:progress',()=>{refresh();checkpoint();});for(const event of ['input','change','click'])main?.addEventListener(event,()=>{setTimeout(checkpoint,250);});window.addEventListener('online',()=>{if(expiring)autoSubmit();else checkpoint();});refresh();
 // Assignment values are enforced again on the server when submitting.
 document.querySelectorAll('[data-route="teacher"],[data-open-demo]').forEach(x=>x.hidden=true);
 document.querySelectorAll('[data-route="pc"],[data-route="iot"]').forEach(x=>{if(x.dataset.route!==(a.taskId.startsWith('iot-')?'iot':'pc'))x.hidden=true;});
}
document.addEventListener('DOMContentLoaded',init);
})();
