(()=>{'use strict';const boot=window.SIL_PORTAL,a=boot.assignment,bar=document.getElementById('portal-submission');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function init(){const S=window.SIL;document.body.classList.add('portal-assigned');S.Progress.setStudentId(boot.student.displayCode);const lab=a.taskId.startsWith('iot-')?S.IotLab:S.PcBuilder;if(a.taskId.startsWith('iot-'))lab.switchProject(a.taskId);else lab.switchTask(a.taskId);lab.switchMode(a.mode);S.App.showPage(a.taskId.startsWith('iot-')?'iot':'pc');
 bar.innerHTML=`<div class="portal-row"><div><strong>${esc(a.title)}</strong> · ${esc(boot.student.displayCode)} · ${a.mode==='exam'?'Емтихан':'Оқу'}<p>${esc(a.instruction||'Зертхананы аяқтап, қорытынды жазып, жұмысты жіберіңіз.')}</p></div><a href="/student">← Жеке кабинет</a></div><div id="portal-timer" role="timer" aria-live="off"></div><button id="portal-time-retry" type="button" hidden>Уақытты қайта жүктеу</button><div class="portal-row"><label>Жіберілетін әрекет <select id="portal-attempt" aria-label="Жіберілетін әрекет"></select></label><button id="portal-report" type="button">Қорытынды</button><button id="portal-send" type="button">Оқытушыға жіберу</button></div><p id="portal-submit-status" role="status" aria-live="polite"></p>`;
 const select=document.getElementById('portal-attempt'),status=document.getElementById('portal-submit-status');
 const timer=document.getElementById('portal-timer'),retry=document.getElementById('portal-time-retry'),main=document.getElementById('main');
 let newestId=null,timing=null,timingReady=a.timeLimitMinutes===undefined,clockAnchor=null,expiryAnnounced=false,submitted=false;
 const monotonic=()=>window.performance?window.performance.now():Date.now();
 const serverNow=()=>clockAnchor?clockAnchor.server+monotonic()-clockAnchor.local:Date.now();
 function expired(){return timing?.deadlineAt!=null&&serverNow()>timing.deadlineAt;}
 function tick(){
  const closed=expired()&&timing.latePolicy==='block';
  document.getElementById('portal-send').disabled=!select.value||!timingReady||closed;
  timer.classList.toggle('is-expired',expired());
  if(!timingReady){timer.textContent='Уақыт жүктелуде…';return;}
  if(!timing||timing.deadlineAt===null){timer.textContent='Уақыт шектеусіз';return;}
  const left=Math.max(0,Math.ceil((timing.deadlineAt-serverNow())/1000));
  timer.textContent='Қалған уақыт: '+String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0')+' · '+timing.timeLimitMinutes+' минут';
  if(expired()&&!expiryAnnounced&&!submitted){expiryAnnounced=true;status.textContent=closed?'Уақыт аяқталды. Оқытушы кеш тапсыруды жапқан. Қорытындыңыз осы браузерде сақталған.':'Уақыт аяқталды. Жіберілген жұмыс «Кеш тапсырылды» деп белгіленеді.';}
 }
 async function syncTiming(start){
  retry.hidden=true;
  try{
   const response=await fetch('/api/student/assignments/'+encodeURIComponent(a.id)+'/'+(start?'start':'timing'),{method:start?'POST':'GET',headers:start?{'Content-Type':'application/json'}:{},body:start?'{}':undefined,credentials:'same-origin',cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Уақытты жүктеу орындалмады.');
   if(!data.timing)throw Error('Тапсырманы бастау қажет.');
   timing=data.timing;clockAnchor={server:timing.serverNow,local:monotonic()};timingReady=true;if(main)main.inert=false;tick();
  }catch(error){status.textContent=error.message;retry.hidden=false;tick();}
 }
 retry.onclick=()=>syncTiming(true);
 if(a.timeLimitMinutes!==undefined){if(main)main.inert=true;syncTiming(true);setInterval(tick,1000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&timingReady)syncTiming(false);});}

 function refresh(){const old=select.value,attempts=S.Progress.attempts().filter(x=>x.taskId===a.taskId&&x.mode===a.mode&&x.snapshot).slice().reverse();select.innerHTML=attempts.length?attempts.map(x=>`<option value="${esc(x.id)}">${esc(new Date(x.date).toLocaleString('kk-KZ'))} · ${x.score}/100</option>`).join(''):'<option value="">Алдымен зертхананы аяқтаңыз</option>';if(attempts.length){select.value=attempts[0].id!==newestId?attempts[0].id:attempts.some(x=>x.id===old)?old:attempts[0].id;newestId=attempts[0].id;}else newestId=null;document.getElementById('portal-send').disabled=!attempts.length;document.getElementById('portal-report').disabled=!attempts.length;tick();}
 document.getElementById('portal-report').onclick=()=>{if(select.value){S.Reports.open(select.value);S.App.showPage('report');}};
 document.getElementById('portal-send').onclick=async function(){const attempt=S.Progress.attempts().find(x=>x.id===select.value);if(!attempt)return;if(!timingReady){status.textContent='Алдымен тапсырманың уақытын жүктеңіз.';return;}if(expired()&&timing.latePolicy==='block'){tick();return;}if(!attempt.report?.conclusion?.trim()){status.textContent='«Қорытынды» бөлімін толтырыңыз.';return;}this.disabled=true;status.textContent='Жұмыс серверге жіберілуде…';try{const r=await fetch('/api/student/submissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignmentId:a.id,attempt})});const data=await r.json();if(!r.ok)throw Error(data.error||'Жіберу орындалмады.');submitted=true;status.textContent=data.duplicate?'Бұл әрекет бұрын жіберілген. Оқытушы кабинетінде сақталған.':data.isLate?'Жұмыс оқытушыға «Кеш тапсырылды» белгісімен жіберілді.':'Жұмыс оқытушыға жіберілді. Нәтижені жеке кабинетіңізден көре аласыз.';}catch(e){status.textContent='Жұмыс жіберілмеді: '+e.message;}finally{tick();}};
 document.addEventListener('sil:progress',refresh);refresh();
 // Assignment values are enforced again on the server when submitting.
 document.querySelectorAll('[data-route="teacher"],[data-open-demo]').forEach(x=>x.hidden=true);
 document.querySelectorAll('[data-route="pc"],[data-route="iot"]').forEach(x=>{if(x.dataset.route!==(a.taskId.startsWith('iot-')?'iot':'pc'))x.hidden=true;});
}
document.addEventListener('DOMContentLoaded',init);
})();
