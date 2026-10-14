param([Parameter(Mandatory=$true)][string]$TextFile,
      [Parameter(Mandatory=$true)][string]$Output,
      [string]$Voice = '', [string]$Language = 'auto', [ValidateRange(-10,10)][int]$Rate = 0)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $synth.Rate = $Rate
    $taskText = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
    if ($Voice) { $synth.SelectVoice($Voice) }
    else {
        $taskLanguage = if ($Language -eq 'auto') { if ($taskText -match '[\u3400-\u9fff]') { 'zh' } else { 'en' } } else { $Language }
        $taskInstalledVoice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $taskLanguage } | Select-Object -First 1
        if ($taskInstalledVoice) { $synth.SelectVoice($taskInstalledVoice.VoiceInfo.Name) }
    }
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.SetOutputToWaveFile($Output, $format)
    $synth.Speak($taskText)
} finally { $synth.Dispose() }
