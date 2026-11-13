import urllib.request,time,pathlib
u='https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/en_US-ljspeech-high.onnx?download=true&darb=1'
p=pathlib.Path.home()/'AppData/Local/DarbVideoTools/en_US-ljspeech-high.onnx'
with urllib.request.urlopen(u,timeout=30) as r,p.open('wb') as f:
 print('Connected',r.status,flush=True)
 n=0
 while chunk:=r.read(1024*1024):
  f.write(chunk);n+=len(chunk)
  if n%(10*1024*1024)==0: print(n,flush=True)
print('Complete',p.stat().st_size)
