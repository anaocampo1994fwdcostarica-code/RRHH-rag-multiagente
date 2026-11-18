param(
  [Parameter(Mandatory = $true)]
  [string]$PoolerHost
)

$expectedProjectRef = 'bxtetlzjlgoezxcjhdrw'
$expectedDatabaseUser = "postgres.$expectedProjectRef"
$envFile = Join-Path $PSScriptRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'Missing .env. Copy .env.example before configuring the Session Pooler URL.'
}

$normalizedHost = $PoolerHost.Trim().ToLowerInvariant()
$labels = $normalizedHost.Split('.')
if (
  -not $normalizedHost.EndsWith('.pooler.supabase.com') -or
  $labels.Count -lt 4 -or
  $labels | Where-Object { $_ -notmatch '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$' }
) {
  throw 'PoolerHost must be a valid Session Pooler hostname copied from Supabase Dashboard > Connect.'
}

$content = [System.IO.File]::ReadAllText($envFile)
if ($content -notmatch "(?m)^RLS_TEST_PROJECT_REF=$expectedProjectRef$") {
  throw 'The .env project reference does not match the approved test project.'
}

$securePassword = Read-Host "PostgreSQL password for the approved Session Pooler" -AsSecureString
$bstr = [IntPtr]::Zero

try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    throw 'The password cannot be empty.'
  }

  $encodedUser = [Uri]::EscapeDataString($expectedDatabaseUser)
  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $databaseUrl = "postgresql://$encodedUser`:$encodedPassword@$normalizedHost`:5432/postgres"

  $updates = @{
    'RLS_TEST_CONNECTION_MODE' = 'session_pooler'
    'RLS_TEST_DATABASE_URL' = $databaseUrl
  }
  foreach ($name in $updates.Keys) {
    $replacement = "$name=$($updates[$name])"
    if ($content -match "(?m)^$name=.*$") {
      $content = [regex]::Replace($content, "(?m)^$name=.*$", $replacement)
    } else {
      $content = $content.TrimEnd() + [Environment]::NewLine + $replacement + [Environment]::NewLine
    }
  }

  [System.IO.File]::WriteAllText($envFile, $content)
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  $plainPassword = $null
}

Write-Host 'The Session Pooler configuration was saved to the ignored local .env file.'
