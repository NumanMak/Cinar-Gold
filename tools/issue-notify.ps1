# Günlük issue bildirimi: Zamanlanmış Görev her gün 19:00'da çalıştırır.
# Yalnızca GitHub'dan açık issue listesini okur; yeni (daha önce bildirilmemiş) issue varsa Windows bildirimi gösterir.
# Issue içeriğini çalıştırmaz, yorumlamaz, hiçbir şeyi değiştirmez. Düzeltme için Claude'a "issue'lara bak" demeniz yeterli.
# Kurulum: powershell -ExecutionPolicy Bypass -File tools\issue-notify.ps1 -Install   (görevi kaydeder)
param([switch]$Install, [string]$Repo = 'NumanMak/Cinar-Gold')

$ErrorActionPreference = 'Stop'
$gh = 'C:\Users\Numan\tools\gh\bin\gh.exe'
$logDir = 'C:\Users\Numan\cinar-gold-issue-log'
$seenFile = Join-Path $logDir 'seen.json'
$log = Join-Path $logDir ((Get-Date).ToString('yyyy-MM-dd') + '.txt')
New-Item -ItemType Directory -Force $logDir | Out-Null

if ($Install) {
  $script = $MyInvocation.MyCommand.Path
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
  $trigger = New-ScheduledTaskTrigger -Daily -At '19:00'
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
  Register-ScheduledTask -TaskName 'CinarGold-IssueBildirimi' -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Her gün 19:00: GitHub issue kontrolü ve bildirim (Çınar Gold)' -Force | Out-Null
  Write-Output 'Görev kaydedildi: CinarGold-IssueBildirimi (her gün 19:00)'
  return
}

function Log($m) { Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date).ToString('HH:mm:ss'), $m) -Encoding utf8 }

function Show-Toast($title, $text) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$(& $esc $title)</text><text>$(& $esc $text)</text></binding></visual></toast>")
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
  } catch {
    Log "Bildirim gösterilemedi: $($_.Exception.Message)"
  }
}

try {
  $issues = & $gh issue list -R $Repo --state open --json number,title,createdAt --limit 50 | ConvertFrom-Json
  $seen = @()
  if (Test-Path $seenFile) { $seen = @(Get-Content $seenFile -Raw | ConvertFrom-Json) }
  $new = @($issues | Where-Object { $seen -notcontains $_.number })
  Log "Açık issue: $(@($issues).Count), yeni: $($new.Count)"
  if ($new.Count -gt 0) {
    $numbers = ($new | ForEach-Object { "#$($_.number)" }) -join ', '
    Show-Toast 'Çınar Gold: yeni GitHub issue' "$($new.Count) yeni issue ($numbers). Claude'a ""issue'lara bak"" diyerek düzeltmeye başlayabilirsiniz."
    Log "Bildirildi: $numbers"
    @($issues | ForEach-Object { $_.number }) | ConvertTo-Json -Compress | Set-Content $seenFile -Encoding utf8
  } else {
    # kapanan issue'lar listeden düşsün
    @($issues | ForEach-Object { $_.number }) | ConvertTo-Json -Compress | Set-Content $seenFile -Encoding utf8
  }
} catch {
  Log "HATA: $($_.Exception.Message)"
  exit 1
}
