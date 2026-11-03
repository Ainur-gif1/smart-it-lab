"""HTTP delivery smoke test. This does not test a browser or its offline mode."""
from pathlib import Path
import subprocess,sys,urllib.request,re,json
root=Path(__file__).resolve().parents[1]
process=subprocess.Popen([sys.executable,'-u',str(root/'start_server.py'),'--port','0'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 line=process.stdout.readline().strip()
 if not line.startswith('Open http://127.0.0.1:'):
  raise RuntimeError('Server did not start: '+line)
 origin=line.split('Open ',1)[1].split('/#',1)[0]
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 def read(path):
  with opener.open(origin+'/'+path,timeout=5) as response:
   assert response.status==200
   return response.read().decode('utf-8'),response.headers.get_content_type()
 html,_=read('index.html');refs=re.findall(r'(?:src|href)="([^"]+)"',html)
 checked=[]
 for ref in refs:
  if ref.startswith('#'):continue
  assert not ref.startswith(('http:','https:'))
  body,mime=read(ref)
  assert body
  if ref.endswith('.js'):assert mime in ['text/javascript','application/javascript']
  checked.append(ref)
 print(json.dumps({'status':'PASS','scope':'Local HTTP server and local asset delivery only. No browser automation or disconnected-browser test.','asset_count':len(checked),'assets':checked},ensure_ascii=False,indent=2))
finally:
 process.terminate()
 try:process.wait(timeout=5)
 except subprocess.TimeoutExpired:process.kill();process.wait()
