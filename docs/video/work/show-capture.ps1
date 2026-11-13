$c = Get-Content 'C:\Users\youse\nasa hackthone\docs\video\work\capture.json' -Raw | ConvertFrom-Json
Write-Output ('errors: [' + ($c.errors -join ' | ') + ']')
foreach ($t in $c.takes) {
  Write-Output ('scene ' + $t.scene + ' frames=' + $t.frames.Count + ' dur=' + $t.duration)
}
Get-ChildItem 'C:\Users\youse\nasa hackthone\docs\video\work\frames' | Measure-Object -Name Length -Sum | ForEach-Object { Write-Output ('total frames: ' + $_.Count + ', bytes: ' + $_.Sum) }
