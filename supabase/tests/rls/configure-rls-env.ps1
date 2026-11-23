param(
  [string]$DatabaseUser = 'postgres'
)

$expectedProjectRef = 'bxtetlzjlgoezxcjhdrw'
$expectedHost = "db.$expectedProjectRef.supabase.co"
$envFile = Join-Path $PSScriptRoot '.env'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw 'Missing .env. Copy .env.example before configuring the database URL.'
}

$content = [System.IO.File]::ReadAllText($envFile)
if ($content -notmatch "(?m)^RLS_TEST_PROJECT_REF=$expectedProjectRef$") {
  throw 'The .env project reference does not match the approved test project.'
}

$securePassword = Read-Host "PostgreSQL password for $expectedHost" -AsSecureString
$bstr = [IntPtr]::Zero

try {
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    throw 'The password cannot be empty.'
  }

  $encodedUser = [Uri]::EscapeDataString($DatabaseUser)
  $encodedPassword = [Uri]::EscapeDataString($plainPassword)
  $databaseUrl = "postgresql://$encodedUser`:$encodedPassword@$expectedHost`:5432/postgres?sslmode=require"
  $replacement = "RLS_TEST_DATABASE_URL=$databaseUrl"

  if ($content -match '(?m)^RLS_TEST_DATABASE_URL=.*$') {
    $content = [regex]::Replace($content, '(?m)^RLS_TEST_DATABASE_URL=.*$', $replacement)
  } else {
    $content = $content.TrimEnd() + [Environment]::NewLine + $replacement + [Environment]::NewLine
  }

  [System.IO.File]::WriteAllText($envFile, $content)
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  $plainPassword = $null
}

Write-Host 'RLS_TEST_DATABASE_URL was saved to the ignored local .env file.'
