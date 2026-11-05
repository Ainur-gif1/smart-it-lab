(()=>{'use strict';const boot=window.SIL_PORTAL,a=boot.assignment,bar=document.getElementById('portal-submission');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function init(){const S=window.SIL;document.body.classList.add('portal-assigned');S.Progress.setStudentId(boot.student.displayCode);const lab=a.taskId.startsWith('iot-')?S.IotLab:S.PcBuilder;if(a.taskId.startsWith('iot-'))lab.switchProject(a.taskId);else lab.switchTask(a.taskId);lab.switchMode(a.mode);S.App.showPage(a.taskId.startsWith('iot-')?'iot':'pc');
 bar.innerHTML=`<div class="portal-row"><div><strong>${esc(a.title)}</strong> · ${esc(boot.student.displayCode)} · ${a.mode==='exam'?'Емтихан':'Оқу'}<p>${esc(a.instruction||'Зертхананы аяқтап, қорытынды жазып, жұмысты жіберіңіз.')}</p></div><a href="/student">← Жеке кабинет</a></div><div id="portal-timer" role="timer" aria-live="off"></div><button id="portal-time-retry" type="button" hidden>Уақытты қайта жүктеу</button><div class="portal-row"><button id="portal-report" type="button">Қорытынды</button><button id="portal-send" type="button">Оқытушыға жіберу</button></div><a id="portal-result-link" href="/student" hidden>Нәтижені көру →</a><p id="portal-submit-status" role="status" aria-live="polite"></p>`;
 const status=document.getElementById('portal-submit-status');
 const timer=document.getElementById('portal-timer'),retry=document.getElementById('portal-time-retry'),main=document.getElementById('main');
 let currentAttemptId=null,timing=null,timingReady=a.timeLimitMinutes===undefined,clockAnchor=null,expiryAnnounced=false,submitted=false,sending=false,stoppedAt=null,ticker=null;
 const monotonic=()=>window.performance?window.performance.now():Date.now();
 const serverNow=()=>submitted&&stoppedAt!==null?stoppedAt:clockAnchor?clockAnchor.server+monotonic()-clockAnchor.local:Date.now();
 function expired(){return timing?.deadlineAt!=null&&serverNow()>timing.deadlineAt;}
 function lockTask(data={},message='Тапсырма оқытушыға жіберілді. Уақыт тоқтатылды. Қайта жалғастыруға болмайды.'){
  submitted=true;stoppedAt=data.submittedAt?Date.parse(data.submittedAt):serverNow();
  if(ticker!==null){clearInterval(ticker);ticker=null;}
  if(S.IotLab.state.running)S.IotLab.stopSimulation();
  if(main){main.inert=true;main.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);}
  document.body.classList.add('portal-submitted');retry.hidden=true;
  const link=document.getElementById('portal-result-link');link.href='/student'+(data.id||data.submissionId?'#submission-'+encodeURIComponent(data.id||data.submissionId):'');link.hidden=false;
  document.getElementById('portal-send').textContent='Тапсырылды';status.textContent=message;tick();
 }
 function tick(){
  if(submitted){document.getElementById('portal-send').disabled=true;document.getElementById('portal-report').disabled=true;timer.textContent='Уақыт тоқтатылды';return;}
  const closed=expired()&&timing.latePolicy==='block';
  document.getElementById('portal-send').disabled=!currentAttemptId||!timingReady||closed||sending;
  document.getElementById('portal-report').disabled=!currentAttemptId||sending;
  timer.classList.toggle('is-expired',expired());
  if(!timingReady){timer.textContent='Уақыт жүктелуде…';return;}
  if(!timing||timing.deadlineAt===null){timer.textContent='Уақыт шектеусіз';return;}
  const left=Math.max(0,Math.ceil((timing.deadlineAt-serverNow())/1000));
  timer.textContent='Қалған уақыт: '+String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0')+' · '+timing.timeLimitMinutes+' минут';
  if(expired()&&!expiryAnnounced&&!submitted){expiryAnnounced=true;status.textContent=closed?'Уақыт аяқталды. Оқытушы кеш тапсыруды жапқан. Қорытындыңыз осы браузерде сақталған.':'Уақыт аяқталды. Жіберілген жұмыс «Кеш тапсырылды» деп белгіленеді.';}
 }
 async function syncTiming(start){
  if(submitted)return;
  retry.hidden=true;
  try{
   const response=await fetch('/api/student/assignments/'+encodeURIComponent(a.id)+'/'+(start?'start':'timing'),{method:start?'POST':'GET',headers:start?{'Content-Type':'application/json'}:{},body:start?'{}':undefined,credentials:'same-origin',cache:'no-store'});
   const data=await response.json();if(submitted)return;if(!response.ok)throw Object.assign(Error(data.error||'Уақытты жүктеу орындалмады.'),{code:data.code});
   if(!data.timing)throw Error('Тапсырманы бастау қажет.');
   if(data.timing.submitted){lockTask(data.timing);return;}
   timing=data.timing;clockAnchor={server:timing.serverNow,local:monotonic()};timingReady=true;if(main&&!sending&&!submitted)main.inert=false;tick();
  }catch(error){if(submitted)return;if(error.code==='assignment_submitted'){lockTask({},error.message);return;}status.textContent=error.message;retry.hidden=false;tick();}
 }
 retry.onclick=()=>syncTiming(true);
 if(a.timeLimitMinutes!==undefined){if(main)main.inert=true;syncTiming(true);ticker=setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&timingReady)syncTiming(false);});}

 function latestAttempt(){const attempts=S.Progress.attempts().filter(x=>x.taskId===a.taskId&&x.mode===a.mode&&x.snapshot);return attempts[attempts.length-1];}
 function refresh(){if(submitted){tick();return;}const previous=currentAttemptId;currentAttemptId=latestAttempt()?.id||null;if(currentAttemptId&&currentAttemptId!==previous){submitted=false;expiryAnnounced=false;status.textContent='';}document.getElementById('portal-report').disabled=!currentAttemptId;tick();}
 document.getElementById('portal-report').onclick=()=>{if(submitted)return;const attempt=latestAttempt();if(attempt){S.Reports.open(attempt.id);S.App.showPage('report');}};
 document.getElementById('portal-send').onclick=async function(){if(submitted||sending)return;const attempt=latestAttempt();if(!attempt)return;if(!timingReady){status.textContent='Алдымен тапсырманың уақытын жүктеңіз.';return;}if(expired()&&timing.latePolicy==='block'){tick();return;}if(!attempt.report?.conclusion?.trim()){status.textContent='«Қорытынды» бөлімін толтырыңыз.';return;}sending=true;if(main)main.inert=true;tick();status.textContent='Жұмыс серверге жіберілуде…';try{const r=await fetch('/api/student/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignmentId:a.id,attempt})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'Жіберу орындалмады.'),{code:data.code});lockTask(data,data.isLate?'Жұмыс «Кеш тапсырылды» белгісімен жіберілді. Уақыт тоқтатылды. Қайта жалғастыруға болмайды.':undefined);}catch(e){if(e.code==='assignment_submitted')lockTask({},e.message);else status.textContent='Жұмыс жіберілмеді: '+e.message;}finally{sending=false;if(main&&!submitted&&timingReady)main.inert=false;tick();}};
 document.addEventListener('sil:progress',refresh);refresh();
 // Assignment values are enforced again on the server when submitting.
 document.querySelectorAll('[data-route="teacher"],[data-open-demo]').forEach(x=>x.hidden=true);
 document.querySelectorAll('[data-route="pc"],[data-route="iot"]').forEach(x=>{if(x.dataset.route!==(a.taskId.startsWith('iot-')?'iot':'pc'))x.hidden=true;});
}
document.addEventListener('DOMContentLoaded',init);
})();
