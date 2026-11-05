import { createEngines } from './engines.mjs';
const E = createEngines(), SESSION_COOKIE = '__Host-sil_student', SESSION_MS = 12 * 60 * 60 * 1000;
export const TASKS = ['pc-office','pc-gaming','pc-work','iot-light','iot-temp','iot-motion'];
class ApiError extends Error { constructor(status,message,code) { super(message); this.status=status; this.code=code; } }
const fail = (status,message,code) => { throw new ApiError(status,message,code); };
const text = (v,max,min=0) => typeof v === 'string' && v.length >= min && v.length <= max;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const ID = v => text(v,100,1) && /^[a-zA-Z0-9._-]+$/.test(v);
const integer = (v,max=31536000) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const iso = () => new Date().toISOString();
const hex = b => [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
const bytes = h => Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(v) { return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))); }
function secret(env) { if (!text(env.AUTH_PEPPER,256,32)) fail(503,'Құпиясөз қызметі әзірше бапталмаған.'); return env.AUTH_PEPPER; }
export async function hashPassword(password,pepper,salt=hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const pkey=await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const pre=await crypto.subtle.sign('HMAC',pkey,new TextEncoder().encode(password));
  const key=await crypto.subtle.importKey('raw',pre,'PBKDF2',false,['deriveBits']);
  const hash=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:100000},key,256);
  return `pbkdf2-sha256-v1$100000$${salt}$${hex(hash)}`;
}
export async function verifyPassword(password,stored,pepper) {
  const match=/^pbkdf2-sha256-v1\$100000\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored||'');
  const actual=await hashPassword(password,pepper,match?match[1]:'00000000000000000000000000000000');
  const expected=match?stored:'x'.repeat(actual.length);let diff=actual.length^expected.length;
  for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^(expected.charCodeAt(i)||0);
  return diff===0;
}
function passwordValid(v) { return text(v,128,4) && v.trim().length >= 4; }
function json(value,status=200,headers={}) { return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}}); }
async function body(req) {
  if (!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json')) fail(415,'JSON пішімі қажет.');
  if (req.headers.get('origin')!==new URL(req.url).origin) fail(403,'Сұрау көзі расталмады.');
  const reader=req.body?.getReader();if(!reader)fail(400,'Бос сұрау.');let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();fail(413,'Сұрау көлемі тым үлкен.');}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
  let value;try{value=JSON.parse(new TextDecoder().decode(buffer));}catch{fail(400,'JSON файлы қате.');}
  if(!object(value))fail(400,'Дерек пішімі қате.');return value;
}
const first = (env,sql,...args) => env.DB.prepare(sql).bind(...args).first();
const rows = async(env,sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results||[];
const run = (env,sql,...args) => env.DB.prepare(sql).bind(...args).run();
function platformTeacher(req,env) {
  const id=req.headers.get('oai-authenticated-user-id'),email=(req.headers.get('oai-authenticated-user-email')||'').toLowerCase();
  const allowed=(env.TEACHER_EMAILS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  if(!id||!email)fail(401,'Оқытушы ретінде кіріңіз.');
  if(!allowed.includes(email))fail(403,'Оқытушы кабинетіне рұқсат жоқ.');
  return {id,email,role:'teacher'};
}
const TEACHER_COOKIE='__Host-sil_teacher';
function getCookie(req,name){return (req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);}
function teacherCookie(token,maxAge=SESSION_MS/1000){return `${TEACHER_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
async function createTeacherSession(env,id){const token=randomToken();await run(env,'INSERT INTO portal_teacher_sessions(token_hash,teacher_id,expires_at) VALUES(?,?,?)',await digest(token),id,Date.now()+SESSION_MS);return teacherCookie(token);}
async function activeStudentSession(req,env){
 const token=getCookie(req,SESSION_COOKIE);
 if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
 return !!await first(env,'SELECT s.id FROM portal_students s JOIN portal_sessions x ON x.student_id=s.id WHERE x.token_hash=? AND x.expires_at>? AND s.active=1',await digest(token),Date.now());
}
export async function teacherIdentity(req,env){
 const token=getCookie(req,TEACHER_COOKIE);
 if(token&&/^[a-f0-9]{64}$/.test(token)){
  const t=await first(env,'SELECT t.id,t.username FROM portal_teachers t JOIN portal_teacher_sessions x ON x.teacher_id=t.id WHERE x.token_hash=? AND x.expires_at>? AND t.active=1',await digest(token),Date.now());
  if(t)return {...t,role:'teacher',auth:'password'};
 }
 // A student session must never inherit a shared browser's teacher SSO identity.
 if(await activeStudentSession(req,env))fail(401,'Оқытушы логині мен құпиясөзін енгізіңіз.');
 return {...platformTeacher(req,env),auth:'platform'};
}
async function failedLogin(env,keys){const now=Date.now();await env.DB.batch(keys.map(k=>env.DB.prepare('INSERT INTO portal_login_limits(key,failures,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END').bind(k,now,now-900000,now-900000)));}
async function roleLogin(req,env,b){
 const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
 if(!/^[a-z0-9._-]{3,64}$/.test(username)||!text(b.password,128,1))fail(401,'Логин немесе құпиясөз қате.');
 const keys=await limitKeys(req,username);await checkLimits(env,keys);
 const t=await first(env,'SELECT * FROM portal_teachers WHERE username=?',username);
 if(!t)return login(req,env,b);
 const valid=await verifyPassword(b.password,t.password_hash,secret(env));
 if(!t.active||!valid){await failedLogin(env,keys);fail(401,'Логин немесе құпиясөз қате.');}
 await run(env,'DELETE FROM portal_login_limits WHERE key=?',keys[0]);
 const response=json({role:'teacher',redirect:'/teacher'},200,{'Set-Cookie':await createTeacherSession(env,t.id)});
 response.headers.append('Set-Cookie',cookie('',0));return response;
}
async function setupTeacher(req,env,b,method){
 const t=platformTeacher(req,env);
 if(await activeStudentSession(req,env))fail(409,'Студент аккаунты ашық. Одан шығып, оқытушы логинін баптауды жалғастырыңыз.','student_session_active');
 const existing=await first(env,'SELECT id,username FROM portal_teachers WHERE id=?',t.id);
 if(method==='GET'){const response=json({configured:!!existing,username:existing?.username||''});if(getCookie(req,SESSION_COOKIE))response.headers.append('Set-Cookie',cookie('',0));return response;}
 const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
 if(!/^[a-z0-9._-]{3,64}$/.test(username)||!passwordValid(b.password))fail(400,'Логин 3–64 таңба, құпиясөз кемінде 4 таңба болсын.');
 if(await first(env,'SELECT id FROM portal_students WHERE username=?',username)||await first(env,'SELECT id FROM portal_teachers WHERE username=? AND id<>?',username,t.id))fail(409,'Бұл логин қолданылып жатыр.');
 const now=iso(),hash=await hashPassword(b.password,secret(env));
 try{await env.DB.batch([
  env.DB.prepare("DELETE FROM portal_login_names WHERE owner_id=? AND role='teacher'").bind(t.id),
  env.DB.prepare("INSERT INTO portal_login_names(username,role,owner_id) VALUES(?,'teacher',?)").bind(username,t.id),
  env.DB.prepare('INSERT INTO portal_teachers(id,username,password_hash,active,created_at,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,updated_at=excluded.updated_at').bind(t.id,username,hash,now,now),
  env.DB.prepare('DELETE FROM portal_teacher_sessions WHERE teacher_id=?').bind(t.id)
 ]);}catch(error){if(String(error).includes('UNIQUE'))fail(409,'Бұл логин қолданылып жатыр.');throw error;}
 const response=json({ok:true,role:'teacher',redirect:'/teacher'},200,{'Set-Cookie':await createTeacherSession(env,t.id)});response.headers.append('Set-Cookie',cookie('',0));return response;
}
const publicStudent = s => ({id:s.id,username:s.username,displayCode:s.display_code,groupCode:s.group_code,mustChangePassword:!!s.must_change});
export async function studentIdentity(req,env,{allowPasswordChange=false}={}) {
  const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))fail(401,'Логин мен құпиясөз арқылы кіріңіз.');
  const s=await first(env,'SELECT s.* FROM portal_students s JOIN portal_sessions x ON x.student_id=s.id WHERE x.token_hash=? AND x.expires_at>? AND s.active=1',await digest(token),Date.now());
  if(!s)fail(401,'Кіру уақыты аяқталды. Қайта кіріңіз.');
  if(s.must_change&&!allowPasswordChange)fail(403,'Алдымен уақытша құпиясөзді ауыстырыңыз.');return s;
}
function cookie(token,maxAge=SESSION_MS/1000) { return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
async function createSession(env,s) { const token=randomToken();await run(env,'INSERT INTO portal_sessions(token_hash,student_id,expires_at) VALUES(?,?,?)',await digest(token),s.id,Date.now()+SESSION_MS);return cookie(token); }
async function limitKeys(req,username) {const ip=req.headers.get('cf-connecting-ip')||'unknown';return [await digest('login:'+ip+':'+username),await digest('ip:'+ip)];}
async function checkLimits(env,keys) {for(let i=0;i<keys.length;i++){const r=await first(env,'SELECT failures,window_start FROM portal_login_limits WHERE key=?',keys[i]);if(r&&Date.now()-r.window_start<900000&&r.failures>=(i===0?10:100))fail(429,'Кіру әрекеті көп болды. 15 минуттан кейін қайталаңыз.');}}
async function login(req,env,b) {
  const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
  if(!/^[a-z0-9._-]{3,64}$/.test(username)||!text(b.password,128,1))fail(401,'Логин немесе құпиясөз қате.');
  const keys=await limitKeys(req,username);await checkLimits(env,keys);
  const s=await first(env,'SELECT * FROM portal_students WHERE username=?',username);
  const valid=await verifyPassword(b.password,s?.password_hash,secret(env));
  if(!s||!s.active||!valid){
    const now=Date.now();await env.DB.batch(keys.map(k=>env.DB.prepare('INSERT INTO portal_login_limits(key,failures,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END').bind(k,now,now-900000,now-900000)));
    fail(401,'Логин немесе құпиясөз қате.');
  }
  await run(env,'DELETE FROM portal_login_limits WHERE key=?',keys[0]);
  const response=json({student:publicStudent(s),role:'student',redirect:'/student'},200,{'Set-Cookie':await createSession(env,s)});response.headers.append('Set-Cookie',teacherCookie('',0));return response;
}
export function gradeAttempt(a) {
  if(!object(a)||!ID(a.id)||!TASKS.includes(a.taskId)||!object(a.snapshot))fail(400,'Әрекеттің техникалық дерегі жоқ немесе қате.');
  if(!['learn','exam'].includes(a.mode)||!integer(a.mistakes,10000)||!integer(a.hints,10000)||!integer(a.timeSec))fail(400,'Әрекет өлшемдері қате.');
  const snap=a.snapshot;let analysis,score,completed,observations=null;
  if(a.taskId.startsWith('pc-')){
    if(snap.type!=='pc'||!object(snap.build)||typeof snap.launched!=='boolean')fail(400,'ПК дерегі қате.');
    for(const [slot,id]of Object.entries(snap.build))if(!E.PcEngine.SLOTS.includes(slot)||!Object.hasOwn(E.PcEngine.byId,id)||E.PcEngine.byId[id].slot!==slot)fail(400,'ПК компоненті қате.');
    analysis=E.PcEngine.analyze(snap.build,a.taskId);score=E.PcEngine.score(analysis,{launched:snap.launched,mistakes:a.mistakes,hints:a.hints});completed=snap.launched&&analysis.taskOk;
  }else{
    if(snap.type!=='iot'||![null,'esp32','arduino'].includes(snap.controller)||!Array.isArray(snap.modules)||snap.modules.length>20||!Array.isArray(snap.values)||snap.values.length>128)fail(400,'IoT дерегі қате.');
    const ids=new Set();for(const m of snap.modules){if(!object(m)||!Object.hasOwn(E.IotEngine.byId,m.id)||E.IotEngine.byId[m.id].kind==='controller'||ids.has(m.id)||(m.pin!==null&&!text(m.pin,20)))fail(400,'IoT модулі қате.');ids.add(m.id);}
    const project=E.IotEngine.getProject(a.taskId),observed={on:false,off:false};observations=observed;
    for(const v of snap.values){if(project.control.type==='toggle'){if(typeof v!=='boolean')fail(400,'Сенсор мәні қате.');}else if(typeof v!=='number'||!Number.isFinite(v)||v<project.control.min||v>project.control.max)fail(400,'Сенсор мәні қате.');observed[project.isOn(v)?'on':'off']=true;}
    analysis=E.IotEngine.analyze({projectId:a.taskId,controller:snap.controller,modules:snap.modules});
    score=E.IotEngine.score(analysis,{simReady:analysis.ok,observed,mistakes:a.mistakes,hints:a.hints});completed=analysis.ok&&observed.on&&observed.off;
  }
  return {score:score.total,completed,check:assessment(a,analysis,score,observations)};
}
function assessment(attempt,analysis,score,observations){
 const pc=attempt.taskId.startsWith('pc-'),engine=pc?E.PcEngine:E.IotEngine;
 const issues=analysis.issues.map(issue=>{
  const pin=issue.pin??attempt.snapshot.modules?.find(m=>m.id===issue.compId)?.pin;
  const location=pc?(issue.slots||[]).map(slot=>E.t('pc.slots.'+slot)).join(' / '):issue.compId?engine.compName(issue.compId)+(pin?' · '+engine.pinLabel(pin):''):'Контроллер';
  return {code:issue.code,level:issue.level,location,message:engine.describeIssue(issue),nextStep:engine.describeFix(issue)};
 });
 if(pc){
  for(const condition of analysis.conditions)if(!condition.met)issues.push({code:'condition',level:'error',location:'Тапсырма шарты',message:E.t(condition.key),nextStep:E.t(condition.tipKey)});
  if(!attempt.snapshot.launched)issues.push({code:'notLaunched',level:'error',location:'Іске қосу',message:'ПК іске қосылмаған.',nextStep:'Жинақты тексеріп, POST тексеруін іске қосыңыз.'});
 }else{
  for(const [state,label] of [['on','қосылған'],['off','сөнген']])if(!observations?.[state])issues.push({code:'notObserved_'+state,level:'error',location:'Симуляция',message:'Құрылғының '+label+' күйі тексерілмеген.',nextStep:'Симуляцияны іске қосып, датчик мәнін өзгерту арқылы құрылғының екі күйін тексеріңіз.'});
 }
 const labels={required:'Міндетті компоненттер',socket:'Процессор мен аналық плата сокеті',ram:'Жедел жад түрі',cooler:'Салқындату',power:'Қорек қуаты',conditions:'Тапсырма шарттары',launch:'POST іске қосу',controller:'Контроллер',components:'Датчик және орындаушы құрылғы',wiring:'GPIO байланыстары',stateOn:'Қосылған күйді тексеру',stateOff:'Сөнген күйді тексеру'};
 return {ok:analysis.ok??analysis.postOk,issueCodes:analysis.errors.map(x=>x.code),issues,criteria:score.parts.map(part=>({key:part.key,label:labels[part.key]||part.key,points:part.points,max:part.max,passed:part.points===part.max})),penalty:{points:score.penalty,mistakes:score.mistakes,hints:score.hints}};
}
function savedAssessment(row){
 const check=JSON.parse(row.check_json);if(Array.isArray(check.issues)&&Array.isArray(check.criteria))return check;
 try{return gradeAttempt({id:row.attempt_id,taskId:row.task_id,mode:row.assignment_mode||'learn',snapshot:JSON.parse(row.snapshot_json),...JSON.parse(row.metrics_json)}).check;}catch{return check;}
}
function reportFrom(r,allowEmpty=false) {if(!object(r))fail(400,'Қорытындыны толтырыңыз.');const report={evidence:r.evidence??'',fixes:r.fixes??'',conclusion:r.conclusion??''};if(!['evidence','fixes','conclusion'].every(k=>text(report[k],6000))||(!allowEmpty&&!report.conclusion.trim()))fail(400,'Қорытындыны толтырыңыз (6000 таңбаға дейін).');return report;}
async function assignmentRun(env,studentId,assignmentId){return first(env,'SELECT * FROM portal_assignment_runs WHERE student_id=? AND assignment_id=?',studentId,assignmentId);}
export async function finalSubmission(env,studentId,assignmentId){return first(env,'SELECT * FROM portal_submissions WHERE student_id=? AND assignment_id=? ORDER BY submitted_at ASC,id ASC LIMIT 1',studentId,assignmentId);}
function finalView(row,duplicate=false){return {id:row.id,duplicate,submitted:true,automatic:row.submission_kind==='automatic',submittedAt:row.submitted_at,serverDurationSec:row.server_duration_sec,simulatorScore:row.simulator_score,completed:!!row.completed,isLate:(row.late_by_sec||0)>0,lateBySec:row.late_by_sec||0};}
function runView(run,now=Date.now(),finished=null){const deadline=run?.deadline_at??finished?.deadline_at??null;return {startedAt:run?.started_at??finished?.started_at??null,deadlineAt:deadline,timeLimitMinutes:run?.time_limit_minutes??null,latePolicy:run?.late_policy||'block',serverNow:now,expired:deadline!==null&&(finished?Date.parse(finished.submitted_at):now)>deadline,submitted:!!finished,submittedAt:finished?.submitted_at??null,submissionId:finished?.id??null,serverDurationSec:finished?.server_duration_sec??null};}
function emptyAttempt(a){return {id:'auto-'+crypto.randomUUID(),taskId:a.task_id,mode:a.mode,mistakes:0,hints:0,timeSec:0,finished:false,snapshot:a.task_id.startsWith('pc-')?{type:'pc',build:{},launched:false}:{type:'iot',controller:null,modules:[],values:[]},report:{evidence:'',fixes:'',conclusion:''}};}
async function assignmentDraft(env,studentId,assignmentId){const d=await first(env,'SELECT * FROM portal_assignment_drafts WHERE student_id=? AND assignment_id=?',studentId,assignmentId);return d?{attempt:JSON.parse(d.attempt_json),savedAt:d.saved_at,revision:d.revision}:null;}
function submissionStatements(env,data){
 const {id,studentId,assignmentId,attempt,grade,report}=data;
 const columns=['id','teacher_id','student_id','assignment_id','attempt_id','task_id','simulator_score','completed','snapshot_json','report_json','metrics_json','check_json','started_at','deadline_at','late_by_sec','server_duration_sec','submitted_at','submission_kind','received_at'];
 const values=[id,data.teacherId,studentId,assignmentId,attempt.id,attempt.taskId,grade.score,grade.completed?1:0,JSON.stringify(attempt.snapshot),JSON.stringify(report),JSON.stringify({mistakes:attempt.mistakes,hints:attempt.hints,timeSec:attempt.timeSec}),JSON.stringify(grade.check),data.startedAt,data.deadlineAt,data.lateBySec,data.duration,data.submittedAt,data.kind||'manual',data.receivedAt||data.submittedAt];
 return [
  env.DB.prepare('INSERT INTO portal_assignment_finishes(student_id,assignment_id,submission_id,submitted_at) VALUES(?,?,?,?) ON CONFLICT(student_id,assignment_id) DO NOTHING').bind(studentId,assignmentId,id,data.submittedAt),
  env.DB.prepare('INSERT INTO portal_submissions('+columns.join(',')+') SELECT '+values.map(()=>'?').join(',')+' WHERE EXISTS(SELECT 1 FROM portal_assignment_finishes WHERE student_id=? AND assignment_id=? AND submission_id=?) ON CONFLICT(student_id,assignment_id,attempt_id) DO NOTHING').bind(...values,studentId,assignmentId,id)
 ];
}
export async function finalizeExpired(env,{studentId=null,teacherId=null,assignmentId=null}={}){
 const now=Date.now(),conditions=['r.deadline_at IS NOT NULL','r.deadline_at<=?','NOT EXISTS(SELECT 1 FROM portal_submissions x WHERE x.student_id=r.student_id AND x.assignment_id=r.assignment_id)'],args=[now];
 if(studentId){conditions.push('r.student_id=?');args.push(studentId);}if(teacherId){conditions.push('a.teacher_id=?');args.push(teacherId);}if(assignmentId){conditions.push('a.id=?');args.push(assignmentId);}
 const expired=await rows(env,'SELECT r.*,a.teacher_id,a.task_id,a.mode,d.attempt_json FROM portal_assignment_runs r JOIN portal_assignments a ON a.id=r.assignment_id LEFT JOIN portal_assignment_drafts d ON d.student_id=r.student_id AND d.assignment_id=r.assignment_id WHERE '+conditions.join(' AND ')+' ORDER BY r.deadline_at LIMIT 40',...args);
 const statements=[];
 for(const row of expired){
  const attempt=row.attempt_json?JSON.parse(row.attempt_json):emptyAttempt(row),report=reportFrom(attempt.report,true),grade=gradeAttempt(attempt);
  statements.push(...submissionStatements(env,{id:crypto.randomUUID(),studentId:row.student_id,assignmentId:row.assignment_id,teacherId:row.teacher_id,attempt,report,grade,startedAt:row.started_at,deadlineAt:row.deadline_at,lateBySec:0,duration:Math.max(0,Math.floor((row.deadline_at-Date.parse(row.started_at))/1000)),submittedAt:new Date(row.deadline_at).toISOString(),receivedAt:new Date(now).toISOString(),kind:'automatic'}));
 }
 if(statements.length)await env.DB.batch(statements);return expired.length;
}
async function startAssignment(env,student,a){
 const now=Date.now(),limit=a.time_limit_minutes??null;
 await run(env,'INSERT INTO portal_assignment_runs(student_id,assignment_id,started_at,deadline_at,time_limit_minutes,late_policy) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,assignment_id) DO NOTHING',student.id,a.id,new Date(now).toISOString(),limit===null?null:now+limit*60000,limit,a.late_policy||'block');
 await run(env,'INSERT INTO portal_assignment_drafts(student_id,assignment_id,attempt_json,saved_at,revision) VALUES(?,?,?,?,0) ON CONFLICT(student_id,assignment_id) DO NOTHING',student.id,a.id,JSON.stringify(emptyAttempt(a)),now);
 return runView(await assignmentRun(env,student.id,a.id));
}
function submissionView(r,{details=false}={}) {return {id:r.id,assignmentId:r.assignment_id,studentCode:r.display_code,username:r.username,title:r.title,taskId:r.task_id,simulatorScore:r.simulator_score,completed:!!r.completed,teacherScore:r.teacher_score,feedback:r.feedback,status:r.status,submittedAt:r.submitted_at,reviewedAt:r.reviewed_at,automatic:r.submission_kind==='automatic',receivedAt:r.received_at,startedAt:r.started_at,deadlineAt:r.deadline_at,lateBySec:r.late_by_sec||0,isLate:(r.late_by_sec||0)>0,serverDurationSec:r.server_duration_sec,...(details?{report:JSON.parse(r.report_json),snapshot:JSON.parse(r.snapshot_json),metrics:JSON.parse(r.metrics_json),checkResult:savedAssessment(r)}:{})};}
const submissionSelect='SELECT x.*,s.display_code,s.username,a.title,a.mode AS assignment_mode FROM portal_submissions x JOIN portal_students s ON s.id=x.student_id JOIN portal_assignments a ON a.id=x.assignment_id';
export async function handleApi(req,env) {
 try{
  if(!env.DB)fail(503,'Дерекқор қызметі әзірше қолжетімсіз.');
  const u=new URL(req.url),path=u.pathname.replace(/^\/api/,'');const method=req.method;
  const b=['POST','PATCH','PUT','DELETE'].includes(method)?await body(req):{};
  if(path==='/auth/leave-student'&&method==='POST'){
    const token=getCookie(req,SESSION_COOKIE);if(token&&/^[a-f0-9]{64}$/.test(token))await run(env,'DELETE FROM portal_sessions WHERE token_hash=?',await digest(token));
    return json({ok:true,redirect:'/teacher/setup'},200,{'Set-Cookie':cookie('',0)});
  }
  if(path==='/auth/login'&&method==='POST')return await roleLogin(req,env,b);
  if(path==='/student/login'&&method==='POST')return await login(req,env,b);
  if(path==='/teacher/account'&&['GET','POST'].includes(method))return await setupTeacher(req,env,b,method);
  if(path.startsWith('/teacher/')){
    const teacher=await teacherIdentity(req,env);
    if(method==='GET'&&path.startsWith('/teacher/submissions'))await finalizeExpired(env,{teacherId:teacher.id});
    if(path==='/teacher/me'&&method==='GET'){
      const account=await first(env,'SELECT username FROM portal_teachers WHERE id=?',teacher.id);
      return json({teacher:{role:'teacher',username:account?.username||'',configured:!!account,auth:teacher.auth}});
    }
    if(path==='/teacher/password'&&method==='POST'){
      const account=await first(env,'SELECT * FROM portal_teachers WHERE id=? AND active=1',teacher.id);if(!account)fail(409,'Оқытушы аккаунты табылмады.');
      const keys=await limitKeys(req,account.username);await checkLimits(env,keys);
      if(!text(b.oldPassword,128,1)||!passwordValid(b.newPassword)||b.oldPassword===b.newPassword)fail(400,'Жаңа құпиясөз өзгеше және кемінде 4 таңба болсын.');
      if(!await verifyPassword(b.oldPassword,account.password_hash,secret(env))){await failedLogin(env,keys);fail(401,'Ағымдағы құпиясөз қате.');}
      const hash=await hashPassword(b.newPassword,secret(env));await env.DB.batch([env.DB.prepare('UPDATE portal_teachers SET password_hash=?,updated_at=? WHERE id=?').bind(hash,iso(),teacher.id),env.DB.prepare('DELETE FROM portal_teacher_sessions WHERE teacher_id=?').bind(teacher.id)]);
      await env.DB.batch(keys.map(k=>env.DB.prepare('DELETE FROM portal_login_limits WHERE key=?').bind(k)));
      return json({ok:true},200,{'Set-Cookie':await createTeacherSession(env,teacher.id)});
    }
    if(path==='/teacher/logout'&&method==='POST'){
      const token=getCookie(req,TEACHER_COOKIE);if(token)await run(env,'DELETE FROM portal_teacher_sessions WHERE token_hash=?',await digest(token));
      const response=json({ok:true,redirect:'/signout-with-chatgpt?return_to=%2Flogin'},200,{'Set-Cookie':teacherCookie('',0)});response.headers.append('Set-Cookie',cookie('',0));return response;
    }
    if(path==='/teacher/students'&&method==='GET')return json({students:(await rows(env,'SELECT id,username,display_code,group_code,active,must_change,created_at FROM portal_students WHERE teacher_id=? ORDER BY created_at DESC',teacher.id)).map(s=>({...publicStudent(s),active:!!s.active}))});
    if(path==='/teacher/students'&&method==='POST'){
      const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
      if(!/^[a-z0-9._-]{3,64}$/.test(username)||!text(b.displayCode,60,1)||!text(b.groupCode||'',60)||!passwordValid(b.password))fail(400,'Логин 3–64 таңба, құпиясөз кемінде 4 таңба болсын.');
      if(await first(env,'SELECT id FROM portal_students WHERE username=?',username)||await first(env,'SELECT id FROM portal_teachers WHERE username=?',username))fail(409,'Бұл логин қолданылып жатыр.');
      const id=crypto.randomUUID(),now=iso(),hash=await hashPassword(b.password,secret(env));
      try{await env.DB.batch([
       env.DB.prepare("INSERT INTO portal_login_names(username,role,owner_id) VALUES(?,'student',?)").bind(username,id),
       env.DB.prepare('INSERT INTO portal_students(id,teacher_id,username,display_code,group_code,password_hash,must_change,active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1,?,?)').bind(id,teacher.id,username,b.displayCode,b.groupCode||'',hash,now,now)
      ]);}catch(error){if(String(error).includes('UNIQUE'))fail(409,'Бұл логин қолданылып жатыр.');throw error;}
      return json({student:{id,username,displayCode:b.displayCode,groupCode:b.groupCode||'',mustChangePassword:true}},201);
    }
    const studentAction=/^\/teacher\/students\/([a-zA-Z0-9._-]+)\/access$/.exec(path);
    if(studentAction&&method==='POST'){
      const s=await first(env,'SELECT * FROM portal_students WHERE id=? AND teacher_id=?',studentAction[1],teacher.id);if(!s)fail(404,'Студент табылмады.');
      if(typeof b.active!=='boolean')fail(400,'Қолжетімділік күйі қате.');
      await env.DB.batch([env.DB.prepare('UPDATE portal_students SET active=?,updated_at=? WHERE id=? AND teacher_id=?').bind(b.active?1:0,iso(),s.id,teacher.id),env.DB.prepare('DELETE FROM portal_sessions WHERE student_id=?').bind(s.id)]);
      return json({ok:true});
    }
    if(path==='/teacher/assignments'&&method==='GET')return json({assignments:await rows(env,'SELECT id,task_id AS taskId,title,instruction,mode,time_limit_minutes AS timeLimitMinutes,late_policy AS latePolicy,active,created_at AS createdAt FROM portal_assignments WHERE teacher_id=? ORDER BY created_at DESC',teacher.id)});
    if(path==='/teacher/assignments'&&method==='POST'){
      if(!TASKS.includes(b.taskId)||!text(b.title,120,1)||!text(b.instruction||'',4000)||!['learn','exam'].includes(b.mode))fail(400,'Тапсырма өрістері қате.');
      const limit=b.timeLimitMinutes??null,policy=b.latePolicy??'block';
      if(!(limit===null||(Number.isInteger(limit)&&limit>=1&&limit<=1440))||!['block','mark'].includes(policy))fail(400,'Уақыт 1–1440 минут аралығында болсын.');
      const id=crypto.randomUUID();await run(env,'INSERT INTO portal_assignments(id,teacher_id,task_id,title,instruction,mode,time_limit_minutes,late_policy,active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)',id,teacher.id,b.taskId,b.title,b.instruction||'',b.mode,limit,policy,iso());return json({id},201);
    }
    const assignmentAction=/^\/teacher\/assignments\/([a-zA-Z0-9._-]+)$/.exec(path);
    if(assignmentAction&&method==='PATCH'){
      const hasTime=Object.hasOwn(b,'timeLimitMinutes')||Object.hasOwn(b,'latePolicy');
      if((b.active!==undefined&&typeof b.active!=='boolean')||(!hasTime&&b.active===undefined))fail(400,'Тапсырма күйі қате.');
      const a=await first(env,'SELECT * FROM portal_assignments WHERE id=? AND teacher_id=?',assignmentAction[1],teacher.id);if(!a)fail(404,'Тапсырма табылмады.');
      const limit=Object.hasOwn(b,'timeLimitMinutes')?b.timeLimitMinutes:a.time_limit_minutes,policy=b.latePolicy??a.late_policy;
      if(!(limit===null||(Number.isInteger(limit)&&limit>=1&&limit<=1440))||!['block','mark'].includes(policy))fail(400,'Уақыт 1–1440 минут аралығында болсын.');
      if(hasTime&&(await first(env,'SELECT started_at FROM portal_assignment_runs WHERE assignment_id=? LIMIT 1',a.id)||await first(env,'SELECT id FROM portal_submissions WHERE assignment_id=? LIMIT 1',a.id)))fail(409,'Студент тапсырманы бастап қойған. Уақытты өзгерту үшін жаңа тапсырма беріңіз.');
      await run(env,'UPDATE portal_assignments SET active=?,time_limit_minutes=?,late_policy=? WHERE id=? AND teacher_id=?',b.active===undefined?a.active:b.active?1:0,limit,policy,a.id,teacher.id);return json({ok:true});
    }
    if(path==='/teacher/submissions'&&method==='GET')return json({submissions:(await rows(env,submissionSelect+' WHERE x.teacher_id=? ORDER BY x.submitted_at DESC LIMIT 1000',teacher.id)).map(r=>submissionView(r))});
    const submissionAction=/^\/teacher\/submissions\/([a-zA-Z0-9._-]+)$/.exec(path);
    if(submissionAction){const r=await first(env,submissionSelect+' WHERE x.id=? AND x.teacher_id=?',submissionAction[1],teacher.id);if(!r)fail(404,'Жұмыс табылмады.');if(method==='GET')return json({submission:submissionView(r,{details:true})});if(method==='PATCH'){
      if(!text(b.feedback,4000)||!(b.teacherScore===null||integer(b.teacherScore,100)))fail(400,'Баға 0–100 аралығында болсын.');
      await run(env,"UPDATE portal_submissions SET teacher_score=?,feedback=?,status='reviewed',reviewed_at=? WHERE id=? AND teacher_id=?",b.teacherScore,b.feedback,iso(),r.id,teacher.id);return json({ok:true});
    }}
  }else if(path.startsWith('/student/')){
    const s=await studentIdentity(req,env,{allowPasswordChange:['/student/me','/student/password','/student/logout'].includes(path)});
    if(path==='/student/me'&&method==='GET')return json({student:publicStudent(s)});
    if(path==='/student/logout'&&method==='POST'){
      const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);if(token)await run(env,'DELETE FROM portal_sessions WHERE token_hash=?',await digest(token));return json({ok:true},200,{'Set-Cookie':cookie('',0)});
    }
    if(path==='/student/password'&&method==='POST'){
      const keys=await limitKeys(req,s.username);await checkLimits(env,keys);
      if(!text(b.oldPassword,128,1)||!passwordValid(b.newPassword)||b.oldPassword===b.newPassword)fail(400,'Жаңа құпиясөз өзгеше және кемінде 4 таңба болсын.');
      if(!await verifyPassword(b.oldPassword,s.password_hash,secret(env))){await run(env,'INSERT INTO portal_login_limits(key,failures,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END',keys[0],Date.now(),Date.now()-900000,Date.now()-900000);fail(401,'Ағымдағы құпиясөз қате.');}
      const hash=await hashPassword(b.newPassword,secret(env));await env.DB.batch([env.DB.prepare('UPDATE portal_students SET password_hash=?,must_change=0,updated_at=? WHERE id=?').bind(hash,iso(),s.id),env.DB.prepare('DELETE FROM portal_sessions WHERE student_id=?').bind(s.id)]);await run(env,'DELETE FROM portal_login_limits WHERE key=?',keys[0]);return json({ok:true},200,{'Set-Cookie':await createSession(env,s)});
    }
    await finalizeExpired(env,{studentId:s.id});
    if(path==='/student/assignments'&&method==='GET')return json({serverNow:Date.now(),assignments:await rows(env,'SELECT a.id,a.task_id AS taskId,a.title,a.instruction,a.mode,a.time_limit_minutes AS timeLimitMinutes,a.late_policy AS latePolicy,a.created_at AS createdAt,r.started_at AS startedAt,r.deadline_at AS deadlineAt,f.id AS submissionId,f.submitted_at AS submittedAt,f.server_duration_sec AS serverDurationSec FROM portal_assignments a LEFT JOIN portal_assignment_runs r ON r.assignment_id=a.id AND r.student_id=? LEFT JOIN portal_submissions f ON f.id=(SELECT x.id FROM portal_submissions x WHERE x.student_id=? AND x.assignment_id=a.id ORDER BY x.submitted_at ASC,x.id ASC LIMIT 1) WHERE a.teacher_id=? AND a.active=1 ORDER BY a.created_at DESC',s.id,s.id,s.teacher_id)});
    const runAction=/^\/student\/assignments\/([a-zA-Z0-9._-]+)\/(start|timing|draft|expire)$/.exec(path);
    if(runAction&&((['start','draft','expire'].includes(runAction[2])&&method==='POST')||(runAction[2]==='timing'&&method==='GET'))){
      const a=await first(env,'SELECT * FROM portal_assignments WHERE id=? AND teacher_id=?',runAction[1],s.teacher_id);if(!a)fail(404,'Белсенді тапсырма табылмады.');
      const finished=await finalSubmission(env,s.id,a.id);
      if(runAction[2]==='start'){if(finished)fail(409,'Тапсырма тапсырылған. Қайта жалғастыруға болмайды. Нәтижені жеке кабинеттен қараңыз.','assignment_submitted');if(!a.active)fail(404,'Белсенді тапсырма табылмады.');const timing=await startAssignment(env,s,a);return json({timing,draft:await assignmentDraft(env,s.id,a.id)});}
      const started=await assignmentRun(env,s.id,a.id);
      if(runAction[2]==='expire'){if(finished)return json(finalView(finished));if(!started||started.deadline_at===null||Date.now()<started.deadline_at)fail(409,'Берілген уақыт әлі аяқталған жоқ.','deadline_not_reached');await finalizeExpired(env,{studentId:s.id,assignmentId:a.id});const saved=await finalSubmission(env,s.id,a.id);if(!saved)fail(503,'Автоматты тапсыру орындалмады. Қайта жіберіледі.');return json(finalView(saved));}
      if(runAction[2]==='draft'){
       if(finished)return json(finalView(finished));if(!started)fail(409,'Тапсырманы алдымен бастаңыз.');if(!a.active)fail(404,'Белсенді тапсырма табылмады.');
       const attempt=b.attempt;if(!object(attempt)||attempt.taskId!==a.task_id||attempt.mode!==a.mode)fail(400,'Жұмыс берілген тапсырмаға сәйкес емес.');
       gradeAttempt(attempt);const report=reportFrom(attempt.report,true),now=Date.now();
       if(started.deadline_at!==null&&now>=started.deadline_at){await finalizeExpired(env,{studentId:s.id,assignmentId:a.id});return json(finalView(await finalSubmission(env,s.id,a.id)));}
       const draft={id:attempt.id,taskId:a.task_id,mode:a.mode,mistakes:attempt.mistakes,hints:attempt.hints,timeSec:attempt.timeSec,snapshot:attempt.snapshot,report,finished:attempt.finished===true};
       await run(env,'INSERT INTO portal_assignment_drafts(student_id,assignment_id,attempt_json,saved_at,revision) VALUES(?,?,?,?,1) ON CONFLICT(student_id,assignment_id) DO UPDATE SET attempt_json=excluded.attempt_json,saved_at=excluded.saved_at,revision=revision+1',s.id,a.id,JSON.stringify(draft),now);return json({ok:true,savedAt:now});
      }
      return json({timing:started||finished?runView(started,Date.now(),finished):null,serverNow:Date.now()});
    }
    if(path==='/student/submissions'&&method==='GET')return json({submissions:(await rows(env,submissionSelect+' WHERE x.student_id=? ORDER BY x.submitted_at DESC LIMIT 1000',s.id)).map(r=>submissionView(r,{details:true}))});
    if(path==='/student/submissions'&&method==='POST'){
      if(!ID(b.assignmentId))fail(400,'Тапсырманы таңдаңыз.');
      const a=await first(env,'SELECT * FROM portal_assignments WHERE id=? AND teacher_id=? AND active=1',b.assignmentId,s.teacher_id);if(!a)fail(404,'Белсенді тапсырма табылмады.');
      const r=b.attempt;if(!object(r)||r.taskId!==a.task_id||r.mode!==a.mode)fail(400,'Жұмыс берілген тапсырмаға сәйкес емес.');
      const report=reportFrom(r.report),grade=gradeAttempt(r);
      const old=await first(env,'SELECT * FROM portal_submissions WHERE student_id=? AND assignment_id=? AND attempt_id=?',s.id,a.id,r.id);if(old)return json(finalView(old,true));
      if(await finalSubmission(env,s.id,a.id))fail(409,'Тапсырма бұрын тапсырылған. Қайта тапсыруға болмайды.','assignment_submitted');
      const now=Date.now(),started=await assignmentRun(env,s.id,a.id);
      if(a.time_limit_minutes!==null&&!started)fail(409,'Тапсырманы алдымен «Бастау» батырмасымен ашыңыз.','assignment_not_started');
      const deadline=started?.deadline_at??null,lateBySec=deadline!==null&&now>deadline?Math.ceil((now-deadline)/1000):0;
      if(deadline!==null&&now>=deadline){await finalizeExpired(env,{studentId:s.id,assignmentId:a.id});fail(409,'Уақыт аяқталды. Жұмыс автоматты тапсырылды. Қайта жалғастыруға болмайды.','assignment_submitted');}
      const duration=started?Math.max(0,Math.floor((now-Date.parse(started.started_at))/1000)):null;
      const id=crypto.randomUUID(),submittedAt=new Date(now).toISOString();
      await env.DB.batch(submissionStatements(env,{id,studentId:s.id,assignmentId:a.id,teacherId:s.teacher_id,attempt:r,grade,report,startedAt:started?.started_at??null,deadlineAt:deadline,lateBySec,duration,submittedAt,kind:'manual'}));
      const saved=await finalSubmission(env,s.id,a.id);if(!saved||saved.attempt_id!==r.id)fail(409,'Тапсырма басқа терезеден тапсырылып қойған. Нәтижені жеке кабинеттен қараңыз.','assignment_submitted');
      return json(finalView(saved,saved.id!==id),saved.id===id?201:200);
    }
  }
  fail(404,'Мекенжай табылмады.');
 }catch(error){if(error instanceof ApiError)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);return json({error:'Сервер сұрауды орындай алмады. Кейін қайталаңыз.'},500);}
}
