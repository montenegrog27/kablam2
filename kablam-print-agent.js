const http = require("http");
const https = require("https");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");

const PORT = 9102;
const POLL_INTERVAL = 3000;
const SUPABASE_URL = "https://zvfmgrcvlnpvvyvybuxc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Zm1ncmN2bG5wdnZ5dnlidXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NDQ1NjAsImV4cCI6MjA4NzEyMDU2MH0.aLs0DSKNMT1xE1dMrx5011IvjbhYoborPSn5L8PTFJE";

let authToken = null, tenantId = null, branchId = null, branchName = "", printers = [], lastCheckId = null, polling = false;
let detectedPrinters = [];
let testResults = [];

// ==========================
// HTTPS
// ==========================
function httpsReq(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, port: 443, path: u.pathname + u.search, method, headers }, (res) => {
      let d = ""; res.on("data", (c) => d += c); res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}

// ==========================
// DETECTAR IMPRESORAS
// ==========================
function detectWindowsPrinters() {
  return new Promise((resolve) => {
    detectedPrinters = [];
    exec('wmic printer get name,driverName,portName /format:csv', { timeout: 5000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      const lines = stdout.trim().split("\n").slice(1);
      lines.forEach((line) => {
        const parts = line.split(",");
        if (parts.length >= 3) {
          const name = (parts[1] || "").trim();
          const port = (parts[3] || "").trim();
          if (name && !name.includes("OneNote") && !name.includes("PDF") && !name.includes("Fax")) {
            detectedPrinters.push({ name, port });
          }
        }
      });
      resolve(detectedPrinters);
    });
  });
}

function testPrinter(printerName) {
  return new Promise((resolve) => {
    const testFile = path.join(__dirname, `test_${Date.now()}.txt`);
    const testContent = `\x1b\x40\x1b\x61\x01${"KABLAM TEST"}\x0a\x1b\x61\x00${"Si ves esto, la impresora funciona!"}\x0a\x0a${"Fecha: " + new Date().toLocaleString()}\x0a\x0a\x1b\x64\x03\x1d\x56\x00`;
    try {
      fs.writeFileSync(testFile, testContent, "latin1");
      const start = Date.now();
      exec(`print /D:"${printerName}" "${testFile}"`, { timeout: 10000, shell: "cmd.exe" }, (err) => {
        const elapsed = Date.now() - start;
        try { fs.unlinkSync(testFile); } catch {}
        resolve({ success: !err, error: err?.message, elapsed });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

async function detectAndTestAll() {
  await detectWindowsPrinters();
  testResults = [];
  for (const p of detectedPrinters) {
    console.log(`🧪 Probando ${p.name} (${p.port})...`);
    const result = await testPrinter(p.name);
    testResults.push({ ...p, ...result });
    console.log(`   ${result.success ? "✅" : "❌"} ${result.elapsed}ms${result.error ? " - " + result.error : ""}`);
  }
}

// ==========================
// LOGIN
// ==========================
async function login(email, password) {
  try {
    const data = await httpsReq(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, "POST",
      { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY }, { email, password });
    if (data.access_token) {
      authToken = data.access_token;
      console.log(`✅ Login exitoso`);
      await loadUserData();
      startPolling();
      return true;
    }
    return false;
  } catch (err) { console.error("Login error:", err.message); return false; }
}

async function loadUserData() {
  try {
    const data = await httpsReq(`${SUPABASE_URL}/rest/v1/users?select=*,tenants(*)`, "GET",
      { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}` });
    const user = Array.isArray(data) ? data[0] : data;
    if (user?.tenant_id) {
      tenantId = user.tenant_id; branchId = user.branch_id;
      branchName = user.tenants?.name || "Kablam";
      console.log(`🏪 ${branchName}`);
      await loadPrinters();
    }
  } catch (err) { console.error("Error user:", err.message); }
}

async function loadPrinters() {
  if (!tenantId || !branchId) return;
  try {
    const data = await httpsReq(`${SUPABASE_URL}/rest/v1/printers?branch_id=eq.${branchId}&select=*`, "GET",
      { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}` });
    printers = (Array.isArray(data) ? data : []).filter(p => p.print_comandas || p.print_ticket);
    console.log(`🖨️ ${printers.length} impresora(s)`);
  } catch (err) { console.error("Error printers:", err.message); }
}

// ==========================
// POLLING
// ==========================
function startPolling() { if (polling) return; polling = true; console.log(`👀 Monitoreando pedidos...`); pollOrders(); }

async function pollOrders() {
  if (!authToken) { setTimeout(pollOrders, POLL_INTERVAL); return; }
  try {
    const filter = lastCheckId ? `&id=gt.${lastCheckId}` : "";
    const data = await httpsReq(
      `${SUPABASE_URL}/rest/v1/orders?branch_id=eq.${branchId}&status=eq.confirmed&select=id,created_at,customer_name,type,address,total,order_items(*,products(name))&order=created_at.desc&limit=5${filter}`,
      "GET", { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authToken}` });
    if (data && data.length > 0) {
      (Array.isArray(data) ? data : [data]).forEach((o) => {
        if (o.id !== lastCheckId) { console.log(`📦 Pedido #${o.id.slice(0, 8)}`); printOrder(o); lastCheckId = o.id; }
      });
    }
  } catch {}
  setTimeout(pollOrders, POLL_INTERVAL);
}

async function printOrder(order) {
  for (const printer of printers) {
    if (!printer.print_comandas) continue;
    const escpos = `${"\x1b\x40"}${"\x1b\x61\x01"}${branchName.toUpperCase()}${"\x1b\x61\x00"}\nCOMANDA\nPedido #${order.id.slice(0, 8)}\nCliente: ${order.customer_name}\nTipo: ${order.type}\n${"--------------------------------"}\n${(order.order_items || []).map((i) => `${i.quantity}x ${i.products?.name || "Producto"}${i.note ? "\n   NOTA: " + i.note : ""}`).join("\n")}\n\n${"--------------------------------"}\n${new Date().toLocaleString()}\n${"\x1b\x64\x03"}${"\x1d\x56\x00"}`;
    const tmp = path.join(__dirname, `order_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tmp, escpos, "latin1");
      await new Promise((resolve) => {
        exec(`print /D:"${printer.name || "POS Printer 203DPI Series"}" "${tmp}"`, { timeout: 10000, shell: "cmd.exe" }, (err) => {
          if (err) console.error(`❌ Error imprimiendo: ${err.message}`);
          else console.log(`✅ Comanda impresa en ${printer.name}`);
          try { fs.unlinkSync(tmp); } catch {}
          resolve();
        });
      });
    } catch (err) { console.error(`❌ Error: ${err.message}`); }
  }
}

// ==========================
// HTTP SERVER
// ==========================
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#f5f5f5;padding:20px}
.card{background:white;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.1);padding:24px;margin-bottom:16px;max-width:600px}
h1{font-size:22px;margin-bottom:8px}input{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;font-size:14px}
button{width:100%;padding:10px;background:#111;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px}
button:hover{background:#000}button:disabled{opacity:0.5}
.success{background:#f0fff4;border:1px solid #c6f6d5;border-radius:8px;padding:12px;margin:8px 0;color:#276749}
.error{background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:12px;margin:8px 0;color:#c53030}
.printer{display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f9f9f9;border-radius:8px;margin-bottom:4px}
.printer .name{font-weight:500}.printer .port{color:#999;font-size:12px}
.test-btn{padding:4px 12px;background:#48bb78;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px}
.test-btn:hover{background:#38a169}.log{background:#1a202c;color:#68d391;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;margin-top:8px;max-height:200px;overflow-y:auto}
.status{padding:8px 12px;background:#e2e8f0;border-radius:8px;margin:4px 0;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:center}
</style></head><body>
${authToken ? `
<div class="card">
  <div class="header"><h1>🖨️ ${branchName}</h1><a href="/logout" style="font-size:12px;color:#999">Cerrar sesión</a></div>
  <div class="status">✅ Conectado — ${printers.length} impresora(s) configurada(s)</div>
</div>
<div class="card">
  <h2>🔍 Detectar impresoras</h2>
  <p style="color:#666;font-size:13px;margin-bottom:12px">Escanea las impresoras instaladas en Windows y probalas</p>
  <button onclick="detect()">🔍 Detectar impresoras</button>
  <div id="printersList"></div>
  <div id="testLog" class="log" style="display:none"></div>
</div>
<div class="card">
  <h2>📦 Pedidos automáticos</h2>
  <div class="status">${polling ? "🟢 Monitoreando cada 3 segundos" : "🔴 Detenido"}</div>
  <p style="color:#666;font-size:12px;margin-top:8px">Imprime automáticamente cuando un pedido pasa a "confirmado"</p>
</div>
<script>
async function detect() {
  document.getElementById("printersList").innerHTML = '<p style="color:#666">Detectando...</p>';
  const res = await fetch("/api/detect");
  const printers = await res.json();
  let html = "";
  for (const p of printers) {
    html += '<div class="printer"><div><div class="name">' + p.name + '</div><div class="port">' + (p.port || "") + '</div></div><button class="test-btn" onclick="testPrinter(\\'' + p.name + '\\')">🧪 Probar</button></div>';
  }
  if (!printers.length) html = '<p style="color:#999">No se encontraron impresoras</p>';
  document.getElementById("printersList").innerHTML = html;
}
async function testPrinter(name) {
  const log = document.getElementById("testLog");
  log.style.display = "block";
  log.innerHTML += "🧪 Probando: " + name + "\\n";
  const res = await fetch("/api/test-printer?name=" + encodeURIComponent(name));
  const result = await res.json();
  log.innerHTML += (result.success ? "✅" : "❌") + " " + (result.elapsed || "?") + "ms" + (result.error ? " - " + result.error : "") + "\\n";
  log.scrollTop = log.scrollHeight;
}
</script>
` : `
<div class="card">
  <h1>🖨️ Kablam Agent</h1>
  <p style="color:#666;margin-bottom:16px">Iniciá sesión para conectar</p>
  <form method="POST" action="/login">
    <input type="email" name="email" placeholder="Email" required>
    <input type="password" name="password" placeholder="Contraseña" required>
    <button type="submit">Iniciar sesión</button>
  </form>
</div>`}
</body></html>`);
    return;
  }

  if (url.pathname === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      const params = new URLSearchParams(body);
      const ok = await login(params.get("email"), params.get("password"));
      res.writeHead(302, { Location: "/" }); res.end();
    });
    return;
  }

  if (url.pathname === "/logout") { authToken = null; polling = false; res.writeHead(302, { Location: "/" }); res.end(); return; }

  if (url.pathname === "/api/detect") {
    await detectWindowsPrinters();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(detectedPrinters));
    return;
  }

  if (url.pathname === "/api/test-printer") {
    const name = url.searchParams.get("name");
    if (!name) { res.writeHead(400); res.end("Missing name"); return; }
    const result = await testPrinter(name);
    console.log(`🧪 Test ${name}: ${result.success ? "✅" : "❌"} ${result.elapsed}ms`);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404); res.end("Not found");
});

// ==========================
// START
// ==========================
detectWindowsPrinters();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   🖨️  Kablam Print Agent v3.0       ║`);
  console.log(`║                                      ║`);
  console.log(`║   → http://localhost:${PORT}            ║`);
  console.log(`║                                      ║`);
  console.log(`║   📋 "Detectar" para ver impresoras  ║`);
  console.log(`║   🧪 "Probar" para testear cada una  ║`);
  console.log(`║   🤖 Imprime automáticamente          ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
