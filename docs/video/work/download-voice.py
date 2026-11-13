import urllib.request,zipfile,pathlib
root=pathlib.Path.home()/'AppData/Local/DarbVideoTools'
files=[('https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip','piper.zip'),('https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx','en_US-lessac-medium.onnx'),('https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json','en_US-lessac-medium.onnx.json'),('https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/MODEL_CARD','MODEL_CARD')]
for url,name in files:
 print('Downloading',name,flush=True);urllib.request.urlretrieve(url,root/name)
with zipfile.ZipFile(root/'piper.zip') as z:z.extractall(root)
print((root/'MODEL_CARD').read_text())
