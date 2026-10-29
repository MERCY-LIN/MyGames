$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($args.Count -ge 1) { [int]$args[0] } else { 5173 }

Start-Process -FilePath 'node' -ArgumentList @("$here\server.mjs", "$port") -WorkingDirectory $here
Start-Sleep -Milliseconds 900
Start-Process "http://127.0.0.1:$port"
