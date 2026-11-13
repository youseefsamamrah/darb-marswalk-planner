$ff = (Get-Command ffmpeg).Source
$fp = (Get-Command ffprobe).Source
Write-Output "FFMPEG=$ff"
Write-Output "FFPROBE=$fp"
$work = 'C:\Users\youse\nasa hackthone\docs\video\work'
for ($i = 1; $i -le 7; $i++) {
  $w = Join-Path $work "voice-$i.wav"
  $d = & $fp -v error -show_entries format=duration -of csv=p=0 $w
  $r = & $fp -v error -select_streams a:0 -show_entries stream=sample_rate,channels -of csv=p=0 $w
  Write-Output "voice-$i duration=$d stream=$r"
}
