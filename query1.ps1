$headers = @{
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Zm1ncmN2bG5wdnZ5dnlidXhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU0NDU2MCwiZXhwIjoyMDg3MTIwNTYwfQ.gMg5v2ZUym7bJxRLfRMpxuW-FmTDxf5Yz1kW9IBiGkg'
    'Authorization' = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Zm1ncmN2bG5wdnZ5dnlidXhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU0NDU2MCwiZXhwIjoyMDg3MTIwNTYwfQ.gMg5v2ZUym7bJxRLfRMpxuW-FmTDxf5Yz1kW9IBiGkg'
    'Content-Type' = 'application/json'
}

$body = @{
    query = "SELECT p.id, p.name, pv.price as price FROM products p JOIN product_variants pv ON pv.product_id = p.id WHERE p.name LIKE '%CHEESE%' LIMIT 5;"
} | ConvertTo-Json -Compress

$response = Invoke-RestMethod -Uri 'https://zvfmgrcvlnpvvyvybuxc.supabase.co/rest/v1/rpc/exec_sql' -Method POST -Headers $headers -Body $body
$response