Add-Type -AssemblyName System.Speech
$lines = Get-Content "$PSScriptRoot/script.json" -Raw | ConvertFrom-Json
foreach ($voice in @('Microsoft Mark','Microsoft Zira','Microsoft David')) {
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $speaker.SelectVoice($voice)
  $speaker.Rate = 0
  $targetPath = Join-Path $PSScriptRoot ($voice.Replace(' ','-')+'.wav')
  $speaker.SetOutputToWaveFile($targetPath)
  $speaker.Speak($lines -join ' ')
  $speaker.Dispose()
}
