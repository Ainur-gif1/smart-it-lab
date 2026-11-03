"""Build local static assets without downloading dependencies."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
out=root/'dist';out.mkdir(exist_ok=True)
for name in ['index.html','LICENSE']:
 shutil.copy2(root/name,out/name)
for name in ['js','css','assets','docs']:
 shutil.copytree(root/name,out/name,dirs_exist_ok=True)
print('Static assets prepared in dist')
