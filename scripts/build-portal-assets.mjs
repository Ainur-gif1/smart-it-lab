import fs from 'node:fs';
import vm from 'node:vm';
const translationContext={};translationContext.window=translationContext;vm.createContext(translationContext);
for(const file of ['translations','classroom'])vm.runInContext(fs.readFileSync(`js/${file}.js`,'utf8'),translationContext);
const pairs={};
function pair(kk,ru){if(typeof kk==='string'&&typeof ru==='string'){pairs[kk]=ru;return;}if(kk&&ru&&typeof kk==='object')for(const k of Object.keys(kk))pair(kk[k],ru[k]);}
pair(translationContext.SIL.I18N.kz,translationContext.SIL.I18N.ru);
Object.assign(pairs,JSON.parse(fs.readFileSync('public/portal/translations.json','utf8')));
fs.writeFileSync('public/portal/locale-data.js','window.SIL_PORTAL_DICTIONARY='+JSON.stringify(pairs)+';\n');
const kk=translationContext.SIL.I18N.kz;
const dictionary={pc:{slots:kk.pc.slots,issue:kk.pc.issue,fix:kk.pc.fix,tasks:kk.pc.tasks},iot:{comp:kk.iot.comp,issue:kk.iot.issue,fix:kk.iot.fix}};
let engines='export function createEngines(){const dictionary='+JSON.stringify(dictionary)+';const scope={SIL:{t:(key,params={})=>{const value=key.split(".").reduce((node,part)=>node?.[part],dictionary);return typeof value==="string"?value.replace(/\\{(\\w+)\\}/g,(match,name)=>params[name]??match):key;}}};\n';
for(const name of ['pc-engine','iot-engine'])engines+=fs.readFileSync(`js/${name}.js`,'utf8').replace('})(typeof window !== "undefined" ? window : globalThis);','})(scope);');
engines+='\nreturn scope.SIL;}\n';fs.writeFileSync('lib/portal/engines.mjs',engines);
for(const dir of ['js','css','assets'])fs.cpSync(dir,`public/lab-assets/${dir}`,{recursive:true});
let html=fs.readFileSync('index.html','utf8').replace(/(href|src)="(css|js|assets)\//g,'$1="/lab-assets/$2/');
html=html.replace('</head>','<link rel="stylesheet" href="/portal/bridge.css"><link rel="stylesheet" href="/portal/i18n.css"></head>').replace('<body>','<body><script id="portal-boot" type="application/json">__PORTAL_BOOT__</script><script src="/portal/bootstrap.js"></script><div id="portal-submission"></div>').replace('</body>','<script src="/portal/locale-data.js"></script><script src="/portal/i18n.js"></script><script src="/portal/bridge.js"></script></body>');
fs.writeFileSync('lib/portal/lab-template.mjs','export default '+JSON.stringify(html)+';\n');
