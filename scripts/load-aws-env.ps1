# Dot-source to load backend/.env into the current PowerShell session:
#   . .\scripts\load-aws-env.ps1
# Values are set as process environment variables and never printed.
$envFile = Join-Path $PSScriptRoot "..\backend\.env"
if (-not (Test-Path $envFile)) {
    throw "Missing $envFile"
}

foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
        continue
    }
    $name, $value = $trimmed -split "=", 2
    $name = $name.Trim() -replace '^\$Env:', ''
    $value = $value.Trim().Trim('"').Trim("'")
    Set-Item -Path "Env:$name" -Value $value
}

if (-not $env:AWS_REGION) { $env:AWS_REGION = "us-east-1" }
$env:AWS_DEFAULT_REGION = $env:AWS_REGION
$env:CDK_DEFAULT_REGION = $env:AWS_REGION
Write-Host "Loaded AWS environment for region $env:AWS_REGION"
