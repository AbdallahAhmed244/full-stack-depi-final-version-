# Export-Activity.ps1
# FoodBridge Activity & Audit Logs Exporter for Peer Review

$dbServer = "(localdb)\MSSQLLocalDB"
$dbName = "FoodBridgeDb"
$connString = "Server=$dbServer;Database=$dbName;Trusted_Connection=True;TrustServerCertificate=True"

$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($outDir)) { $outDir = Get-Location }

$htmlReportPath = Join-Path $outDir "FoodBridge_Activity_Report.html"
$txtReportPath = Join-Path $outDir "FoodBridge_Activity_Report.txt"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  FoodBridge Activity & Audit Log Exporter" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Connecting to local database: $dbServer -> $dbName..." -ForegroundColor Gray

$query = @"
SET NOCOUNT ON;
SELECT TOP 100 
    Id,
    Action,
    TargetEntity,
    TargetId,
    Details,
    CONVERT(varchar, DATEADD(hour, 3, Timestamp), 120) AS LocalTime,
    CONVERT(varchar, Timestamp, 120) AS UtcTime
FROM AuditLogs
ORDER BY Timestamp DESC;
"@

try {
    $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $query
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
    $table = New-Object System.Data.DataTable
    $adapter.Fill($table) | Out-Null
    $conn.Close()

    Write-Host "Found $($table.Rows.Count) logged actions." -ForegroundColor Green
} catch {
    Write-Host "Error connecting to database: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nPress any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 1. Build Text Report
$txtContent = @()
$txtContent += "=========================================================="
$txtContent += "       FOODBRIDGE ACTIVITY & AUDIT LOG REPORT"
$txtContent += " Generated At: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$txtContent += " Total Actions: $($table.Rows.Count)"
$txtContent += "==========================================================`n"

foreach ($row in $table.Rows) {
    $txtContent += "[$($row['LocalTime'])] Action: $($row['Action'])"
    $txtContent += "Target: $($row['TargetEntity']) (ID: $($row['TargetId']))"
    $txtContent += "Details: $($row['Details'])"
    $txtContent += "----------------------------------------------------------"
}
$txtContent | Out-File -FilePath $txtReportPath -Encoding utf8

# 2. Build HTML Report
$htmlRows = ""
foreach ($row in $table.Rows) {
    $action = $row['Action']
    $badgeClass = "bg-gray-100 text-gray-800"
    if ($action -eq "SuspendUser") { $badgeClass = "bg-red-100 text-red-700 font-bold border border-red-200" }
    elseif ($action -eq "ReactivateUser") { $badgeClass = "bg-green-100 text-green-700 font-bold border border-green-200" }
    elseif ($action -eq "CreateAdmin") { $badgeClass = "bg-blue-100 text-blue-700 font-bold border border-blue-200" }
    elseif ($action -like "*Violation*") { $badgeClass = "bg-amber-100 text-amber-700 font-bold border border-amber-200" }

    $htmlRows += @"
    <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="px-4 py-3 font-mono text-xs text-slate-500">#$($row['Id'])</td>
        <td class="px-4 py-3 font-mono text-xs font-semibold text-slate-700">$($row['LocalTime'])</td>
        <td class="px-4 py-3">
            <span class="px-2.5 py-1 rounded-md text-xs $badgeClass">$action</span>
        </td>
        <td class="px-4 py-3 text-xs text-slate-600 font-medium">$($row['TargetEntity'])</td>
        <td class="px-4 py-3 text-xs text-slate-800">$($row['Details'])</td>
    </tr>
"@
}

$htmlContent = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>FoodBridge - Activity & Audit Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-800 p-6 min-h-screen">
    <div class="max-w-6xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl p-6">
        <div class="border-b border-slate-200 pb-4 mb-6 flex items-center justify-between">
            <div>
                <h1 class="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <span>🛡️</span> FoodBridge Activity Report
                </h1>
                <p class="text-xs text-slate-500 mt-1">Exported from Local Database • Total Logged Actions: <strong>$($table.Rows.Count)</strong></p>
            </div>
            <div class="text-right text-xs text-slate-400">
                Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
            </div>
        </div>

        <div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="w-full text-left text-sm">
                <thead class="bg-slate-100 text-slate-600 font-semibold text-xs border-b border-slate-200">
                    <tr>
                        <th class="px-4 py-3">ID</th>
                        <th class="px-4 py-3">Timestamp (Local)</th>
                        <th class="px-4 py-3">Action</th>
                        <th class="px-4 py-3">Target</th>
                        <th class="px-4 py-3">Details & Reason</th>
                    </tr>
                </thead>
                <tbody>
                    $htmlRows
                </tbody>
            </table>
        </div>
        
        <div class="mt-6 text-center text-xs text-slate-400">
            FoodBridge System Auditing System • Anti-Tamper Verification Logs
        </div>
    </div>
</body>
</html>
"@

$htmlContent | Out-File -FilePath $htmlReportPath -Encoding utf8

Write-Host "`nExport Completed Successfully!" -ForegroundColor Green
Write-Host "1. Text Report: $txtReportPath" -ForegroundColor Cyan
Write-Host "2. HTML Report: $htmlReportPath" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
