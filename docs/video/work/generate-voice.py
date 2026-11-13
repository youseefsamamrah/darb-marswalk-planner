import urllib.request,pathlib,subprocess,json,wave
root=pathlib.Path.home()/'AppData/Local/DarbVideoTools'
base='https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/ljspeech/high/'
for name in ['en_US-ljspeech-high.onnx','en_US-ljspeech-high.onnx.json','MODEL_CARD']:
 dest=root/('ljspeech-MODEL_CARD' if name=='MODEL_CARD' else name)
 if not dest.exists() or dest.stat().st_size==0: urllib.request.urlretrieve(base+name+'?download=true&darb=1',dest)
lines=json.loads(pathlib.Path('docs/video/work/script.json').read_text(encoding='utf-8-sig'))
for i,line in enumerate(lines):
 out=pathlib.Path('docs/video/work')/f'voice-{i+1}.wav'
 p=subprocess.run([str(root/'piper/piper.exe'),'--model',str(root/'en_US-ljspeech-high.onnx'),'--output_file',str(out),'--length_scale','1.0','--sentence_silence','0.12'],input=line+'\n',text=True,encoding='utf-8',capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr)
 with wave.open(str(out)) as w:print(i+1,w.getnframes()/w.getframerate(),flush=True)

