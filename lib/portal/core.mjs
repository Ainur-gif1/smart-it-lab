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
  const snap=a.snapshot;let analysis,score,completed;
  if(a.taskId.startsWith('pc-')){
    if(snap.type!=='pc'||!object(snap.build)||typeof snap.launched!=='boolean')fail(400,'ПК дерегі қате.');
    for(const [slot,id]of Object.entries(snap.build))if(!E.PcEngine.SLOTS.includes(slot)||!Object.hasOwn(E.PcEngine.byId,id)||E.PcEngine.byId[id].slot!==slot)fail(400,'ПК компоненті қате.');
    analysis=E.PcEngine.analyze(snap.build,a.taskId);score=E.PcEngine.score(analysis,{launched:snap.launched,mistakes:a.mistakes,hints:a.hints});completed=snap.launched&&analysis.taskOk;
  }else{
    if(snap.type!=='iot'||![null,'esp32','arduino'].includes(snap.controller)||!Array.isArray(snap.modules)||snap.modules.length>20||!Array.isArray(snap.values)||snap.values.length>128)fail(400,'IoT дерегі қате.');
    const ids=new Set();for(const m of snap.modules){if(!object(m)||!Object.hasOwn(E.IotEngine.byId,m.id)||E.IotEngine.byId[m.id].kind==='controller'||ids.has(m.id)||(m.pin!==null&&!text(m.pin,20)))fail(400,'IoT модулі қате.');ids.add(m.id);}
    const project=E.IotEngine.getProject(a.taskId),observed={on:false,off:false};
    for(const v of snap.values){if(project.control.type==='toggle'){if(typeof v!=='boolean')fail(400,'Сенсор мәні қате.');}else if(typeof v!=='number'||!Number.isFinite(v)||v<project.control.min||v>project.control.max)fail(400,'Сенсор мәні қате.');observed[project.isOn(v)?'on':'off']=true;}
    analysis=E.IotEngine.analyze({projectId:a.taskId,controller:snap.controller,modules:snap.modules});
    score=E.IotEngine.score(analysis,{simReady:analysis.ok,observed,mistakes:a.mistakes,hints:a.hints});completed=analysis.ok&&observed.on&&observed.off;
  }
  return {score:score.total,completed,check:{ok:analysis.ok??analysis.postOk,issueCodes:analysis.errors.map(x=>x.code)}};
}
function reportFrom(r) {if(!object(r)||!['evidence','fixes','conclusion'].every(k=>text(r[k],6000)))fail(400,'Есеп өрістері қате.');return {evidence:r.evidence,fixes:r.fixes,conclusion:r.conclusion};}
function submissionView(r,{details=false}={}) {return {id:r.id,assignmentId:r.assignment_id,studentCode:r.display_code,username:r.username,title:r.title,taskId:r.task_id,simulatorScore:r.simulator_score,completed:!!r.completed,teacherScore:r.teacher_score,feedback:r.feedback,status:r.status,submittedAt:r.submitted_at,reviewedAt:r.reviewed_at,...(details?{report:JSON.parse(r.report_json),snapshot:JSON.parse(r.snapshot_json),metrics:JSON.parse(r.metrics_json),checkResult:JSON.parse(r.check_json)}:{})};}
const submissionSelect='SELECT x.*,s.display_code,s.username,a.title FROM portal_submissions x JOIN portal_students s ON s.id=x.student_id JOIN portal_assignments a ON a.id=x.assignment_id';
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
    if(path==='/teacher/me'&&method==='GET'){
      const account=await first(env,'SELECT username FROM portal_teachers WHERE id=?',teacher.id);
      return json({teacher:{role:'teacher',username:account?.username||'',configured:!!account,auth:teacher.auth}});
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
    const studentAction=/^\/teacher\/students\/([a-zA-Z0-9._-]+)\/(reset-password|access)$/.exec(path);
    if(studentAction&&method==='POST'){
      const s=await first(env,'SELECT * FROM portal_students WHERE id=? AND teacher_id=?',studentAction[1],teacher.id);if(!s)fail(404,'Студент табылмады.');
      if(studentAction[2]==='reset-password'){
        if(!passwordValid(b.password))fail(400,'Құпиясөз кемінде 4 таңба болсын.');
        const hash=await hashPassword(b.password,secret(env));await env.DB.batch([env.DB.prepare('UPDATE portal_students SET password_hash=?,must_change=1,updated_at=? WHERE id=? AND teacher_id=?').bind(hash,iso(),s.id,teacher.id),env.DB.prepare('DELETE FROM portal_sessions WHERE student_id=?').bind(s.id)]);
      }else{
        if(typeof b.active!=='boolean')fail(400,'Қолжетімділік күйі қате.');
        await env.DB.batch([env.DB.prepare('UPDATE portal_students SET active=?,updated_at=? WHERE id=? AND teacher_id=?').bind(b.active?1:0,iso(),s.id,teacher.id),env.DB.prepare('DELETE FROM portal_sessions WHERE student_id=?').bind(s.id)]);
      }return json({ok:true});
    }
    if(path==='/teacher/assignments'&&method==='GET')return json({assignments:await rows(env,'SELECT id,task_id AS taskId,title,instruction,mode,active,created_at AS createdAt FROM portal_assignments WHERE teacher_id=? ORDER BY created_at DESC',teacher.id)});
    if(path==='/teacher/assignments'&&method==='POST'){
      if(!TASKS.includes(b.taskId)||!text(b.title,120,1)||!text(b.instruction||'',4000)||!['learn','exam'].includes(b.mode))fail(400,'Тапсырма өрістері қате.');
      const id=crypto.randomUUID();await run(env,'INSERT INTO portal_assignments(id,teacher_id,task_id,title,instruction,mode,active,created_at) VALUES(?,?,?,?,?,?,1,?)',id,teacher.id,b.taskId,b.title,b.instruction||'',b.mode,iso());return json({id},201);
    }
    const assignmentAction=/^\/teacher\/assignments\/([a-zA-Z0-9._-]+)$/.exec(path);
    if(assignmentAction&&method==='PATCH'){
      if(typeof b.active!=='boolean')fail(400,'Тапсырма күйі қате.');
      const a=await first(env,'SELECT id FROM portal_assignments WHERE id=? AND teacher_id=?',assignmentAction[1],teacher.id);if(!a)fail(404,'Тапсырма табылмады.');
      await run(env,'UPDATE portal_assignments SET active=? WHERE id=? AND teacher_id=?',b.active?1:0,a.id,teacher.id);return json({ok:true});
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
    if(path==='/student/assignments'&&method==='GET')return json({assignments:await rows(env,'SELECT id,task_id AS taskId,title,instruction,mode,created_at AS createdAt FROM portal_assignments WHERE teacher_id=? AND active=1 ORDER BY created_at DESC',s.teacher_id)});
    if(path==='/student/submissions'&&method==='GET')return json({submissions:(await rows(env,submissionSelect+' WHERE x.student_id=? ORDER BY x.submitted_at DESC LIMIT 1000',s.id)).map(r=>submissionView(r,{details:true}))});
    if(path==='/student/submissions'&&method==='POST'){
      if(!ID(b.assignmentId))fail(400,'Тапсырманы таңдаңыз.');
      const a=await first(env,'SELECT * FROM portal_assignments WHERE id=? AND teacher_id=? AND active=1',b.assignmentId,s.teacher_id);if(!a)fail(404,'Белсенді тапсырма табылмады.');
      const r=b.attempt;if(!object(r)||r.taskId!==a.task_id||r.mode!==a.mode)fail(400,'Жұмыс берілген тапсырмаға сәйкес емес.');
      const report=reportFrom(r.report),grade=gradeAttempt(r);
      const old=await first(env,'SELECT id FROM portal_submissions WHERE student_id=? AND assignment_id=? AND attempt_id=?',s.id,a.id,r.id);if(old)return json({id:old.id,duplicate:true});
      const id=crypto.randomUUID();await run(env,'INSERT INTO portal_submissions(id,teacher_id,student_id,assignment_id,attempt_id,task_id,simulator_score,completed,snapshot_json,report_json,metrics_json,check_json,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,assignment_id,attempt_id) DO NOTHING',id,s.teacher_id,s.id,a.id,r.id,a.task_id,grade.score,grade.completed?1:0,JSON.stringify(r.snapshot),JSON.stringify(report),JSON.stringify({mistakes:r.mistakes,hints:r.hints,timeSec:r.timeSec}),JSON.stringify(grade.check),iso());
      const saved=await first(env,'SELECT id FROM portal_submissions WHERE student_id=? AND assignment_id=? AND attempt_id=?',s.id,a.id,r.id);return json({id:saved.id,simulatorScore:grade.score,completed:grade.completed},201);
    }
  }
  fail(404,'Мекенжай табылмады.');
 }catch(error){if(error instanceof ApiError)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);return json({error:'Сервер сұрауды орындай алмады. Кейін қайталаңыз.'},500);}
}
