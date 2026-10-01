# 바탕화면에 "바둑 수업 시작" 바로가기를 만듭니다.
$ErrorActionPreference = 'Stop'
$target = Join-Path $PSScriptRoot '바둑수업-시작.bat'
$icon = Join-Path $PSScriptRoot 'baduk.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop '바둑 수업 시작.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = '바둑 수업 프로그램 실행'
$shortcut.Save()

Write-Host ''
Write-Host " 바탕화면에 '바둑 수업 시작' 아이콘을 만들었습니다."
Write-Host ' 앞으로는 그 아이콘을 더블클릭하면 프로그램이 켜집니다.'
