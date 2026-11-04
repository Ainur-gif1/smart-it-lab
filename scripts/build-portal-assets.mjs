import fs from 'node:fs';
let engines='export function createEngines(){const scope={SIL:{t:k=>k}};\n';
for(const name of ['pc-engine','iot-engine'])engines+=fs.readFileSync(`js/${name}.js`,'utf8').replace('})(typeof window !== "undefined" ? window : globalThis);','})(scope);');
engines+='\nreturn scope.SIL;}\n';fs.writeFileSync('lib/portal/engines.mjs',engines);
for(const dir of ['js','css','assets'])fs.cpSync(dir,`public/lab-assets/${dir}`,{recursive:true});
let html=fs.readFileSync('index.html','utf8').replace(/(href|src)="(css|js|assets)\//g,'$1="/lab-assets/$2/');
html=html.replace('</head>','<link rel="stylesheet" href="/portal/bridge.css"></head>').replace('<body>','<body><script id="portal-boot" type="application/json">__PORTAL_BOOT__</script><script src="/portal/bootstrap.js"></script><div id="portal-submission"></div>').replace('</body>','<script src="/portal/bridge.js"></script></body>');
fs.writeFileSync('lib/portal/lab-template.mjs','export default '+JSON.stringify(html)+';\n');
