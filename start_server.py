"""Optional offline localhost server. Python 3 standard library only."""
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='SMART IT LAB Classroom local server')
parser.add_argument('--port',type=int,default=8000)
args=parser.parse_args()
root=Path(__file__).resolve().parent
handler=partial(SimpleHTTPRequestHandler,directory=str(root))
try:
 server=ThreadingHTTPServer(('127.0.0.1',args.port),handler)
except OSError as error:
 raise SystemExit('Cannot bind localhost. Try another port with --port 8001. '+str(error))
print(f'Open http://127.0.0.1:{server.server_port}/#iot')
print('Keep this terminal open. Ctrl+C stops the server. No Internet connection is needed.')
try:server.serve_forever()
except KeyboardInterrupt:pass
finally:server.server_close()
