"""Package the source and the static app, excluding hosting metadata and secrets."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import argparse
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);args=p.parse_args()
out=args.output.resolve();out.parent.mkdir(parents=True,exist_ok=True)
files=[root/n for n in ['index.html','README.md','LICENSE','PROJECT_PASSPORT.md','start_server.py']]
for folder in ['js','css','assets','docs','tests','scripts']:
 files.extend(x for x in (root/folder).rglob('*') if x.is_file() and '__pycache__' not in x.parts)
with ZipFile(out,'w',ZIP_DEFLATED) as z:
 for f in sorted(files):z.write(f,f.relative_to(root))
with ZipFile(out) as z:
 assert z.testzip() is None
 assert all(name in z.namelist() for name in ['index.html','js/app.js','js/iot-lab.js','docs/LESSON_PLAN_KK.md'])
 assert not any(name.startswith(('.git/','.openai/')) for name in z.namelist())
print(out)
