// 🖨️ Kablam Print Agent v1.0
// Agente de impresión local para Kablam POS
//
// Instalación:
// 1. Instalá Node.js desde https://nodejs.org
// 2. Ejecutá: node kablam-print-agent.js
//
// En Windows, creá un acceso directo en:
//   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
//   para que arranque automáticamente al iniciar sesión.

const http = require("http");
const net = require("net");

const PORT = 9102;
const API_BASE = process.env.KABLAM_API_URL || "http://localhost:3001";
let authToken = null;
let tenantId = null;
let branchId = null;
let branchName = "";
let printers = [];
let printQueue = [];
let isPrinting = false;
let lastPrintStatus = "idle";

// ==========================
// SUPABASE AUTH (REST API)
// ==========================

async function supabaseRequest(path, method = "GET", body = null) {
  const url = `${API_BASE.replace("/api", "")}${path}`;
  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": authToken ? `Bearer ${authToken}` : "",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

async function login(credentials) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    authToken = data.access_token;
    // Cargar datos del usuario
    await loadUserData();
    return { success: true };
  }
  return { success: false, error: data.error_description || data.msg || "Error de autenticación" };
}

async function loadUserData() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*,tenants(*)`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${authToken}`,
      },
    });
    const users = await res.json();
    const user = users?.[0];
    if (user) {
      tenantId = user.tenant_id;
      branchId = user.branch_id;
      branchName = user.tenants?.name || "Kablam";
      await loadPrinters();
    }
  } catch (err) {
    console.error("Error cargando datos del usuario:", err.message);
  }
}

async function loadPrinters() {
  if (!tenantId || !branchId) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/printers?branch_id=eq.${branchId}&select=*`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${authToken}`,
      },
    });
    printers = await res.json();
    console.log(`🖨️ Impresoras cargadas: ${printers.length}`);
  } catch (err) {
    console.error("Error cargando impresoras:", err.message);
  }
}

// ==========================
// SERVIDOR HTTP
// ==========================

function serveFile(res, statusCode, contentType, content) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
  });
  res.end(content);
}

function serveHTML(res, body) {
  serveFile(res, 200, "text/html; charset=utf-8", `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kablam Print Agent</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card { background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); padding: 40px; max-width: 420px; width: 100%; margin: 20px; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #111; }
  p { color: #666; margin-bottom: 24px; font-size: 14px; }
  input { width: 100%; padding: 12px 16px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; margin-bottom: 12px; }
  button { width: 100%; padding: 12px; background: #111; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  button:hover { background: #000; }
  .error { color: #e53e3e; font-size: 13px; margin-top: 8px; }
  .success { color: #38a169; font-size: 13px; margin-top: 8px; }
  .status { background: #f0fff4; border: 1px solid #c6f6d5; border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 13px; color: #276749; }
  .status.error { background: #fff5f5; border-color: #fed7d7; color: #c53030; }
  .info { font-size: 12px; color: #999; margin-top: 16px; text-align: center; }
</style></head>
<body>${body}</body></html>`);
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // ---- PÁGINA PRINCIPAL ----
  if (path === "/" || path === "/login") {
    if (authToken) {
      serveHTML(res, `
        <div class="card">
          <h1>🖨️ Kablam Print Agent</h1>
          <p>Conectado como <strong>${branchName}</strong></p>
          <div class="status">
            ✅ Sesión activa<br>
            🏪 ${branchName}<br>
            🖨️ ${printers.length} impresora(s) configurada(s)<br>
            📡 Puerto: ${PORT}<br>
            📨 Último trabajo: ${lastPrintStatus}
          </div>
          <div style="margin-top: 16px; font-size: 13px; color: #666;">
            <p>Configurá tus impresoras como:</p>
            <code style="display:block;background:#f5f5f5;padding:8px;border-radius:4px;margin-top:8px;">
              Tipo: Red (IP)<br>
              IP: 127.0.0.1<br>
              Puerto: ${PORT}
            </code>
          </div>
          <p class="info">Kablam POS - ${new Date().getFullYear()}</p>
        </div>`);
    } else {
      serveHTML(res, `
        <div class="card">
          <h1>🖨️ Kablam Print Agent</h1>
          <p>Iniciá sesión para conectar con tu sucursal</p>
          <form method="POST" action="/login">
            <input type="email" name="email" placeholder="Email" required>
            <input type="password" name="password" placeholder="Contraseña" required>
            <button type="submit">Iniciar sesión</button>
          </form>
          <p class="info">Kablam POS - ${new Date().getFullYear()}</p>
        </div>`);
    }
    return;
  }

  // ---- LOGIN POST ----
  if (path === "/login" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      const params = new URLSearchParams(body);
      const result = await login({ email: params.get("email"), password: params.get("password") });
      if (result.success) {
        res.writeHead(302, { Location: "/" });
        res.end();
      } else {
        serveHTML(res, `
          <div class="card">
            <h1>🖨️ Kablam Print Agent</h1>
            <p>Error al iniciar sesión</p>
            <div class="error">${result.error}</div>
            <form method="POST" action="/login" style="margin-top:16px">
              <input type="email" name="email" placeholder="Email" required>
              <input type="password" name="password" placeholder="Contraseña" required>
              <button type="submit">Intentar de nuevo</button>
            </form>
          </div>`);
      }
    });
    return;
  }

  // ---- STATUS API ----
  if (path === "/status") {
    serveFile(res, 200, "application/json", JSON.stringify({
      authenticated: !!authToken,
      tenantId,
      branchId,
      branchName,
      printers: printers.length,
      port: PORT,
      lastPrint: lastPrintStatus,
    }));
    return;
  }

  // ---- PRINT API (desde la web) ----
  if (path === "/print" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      try {
        const { data, printerIp, printerPort } = JSON.parse(body);
        if (!data) { serveFile(res, 400, "application/json", JSON.stringify({ error: "Faltan datos" })); return; }

        const ip = printerIp || "127.0.0.1";
        const port = printerPort || 9100;
        const buffer = Buffer.from(data, "base64");

        printQueue.push({ ip, port, buffer, res });
        lastPrintStatus = "en cola";
        processQueue();
      } catch (err) {
        serveFile(res, 400, "application/json", JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ---- LOGOUT ----
  if (path === "/logout") {
    authToken = null;
    tenantId = null;
    branchId = null;
    branchName = "";
    printers = [];
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  // 404
  res.writeHead(404);
  res.end("Not found");
});

// ==========================
// COLA DE IMPRESIÓN
// ==========================

function processQueue() {
  if (isPrinting || printQueue.length === 0) return;
  isPrinting = true;
  const job = printQueue.shift();
  console.log(`🖨️ Imprimiendo en ${job.ip}:${job.port} (${job.buffer.length} bytes)...`);

  const socket = new net.Socket();
  socket.setTimeout(10000);
  socket.connect(job.port, job.ip, () => {
    socket.write(job.buffer, (err) => {
      if (err) {
        console.error(`❌ Error: ${err.message}`);
        lastPrintStatus = `error: ${err.message}`;
        job.res.end(JSON.stringify({ error: err.message }));
      } else {
        console.log(`✅ Impresión completada`);
        lastPrintStatus = "ok";
        job.res.end(JSON.stringify({ success: true }));
      }
      socket.destroy();
      isPrinting = false;
      setTimeout(processQueue, 200);
    });
  });
  socket.on("error", (err) => {
    console.error(`❌ Error de conexión: ${err.message}`);
    lastPrintStatus = `error: ${err.message}`;
    job.res.end(JSON.stringify({ error: err.message }));
    socket.destroy();
    isPrinting = false;
    setTimeout(processQueue, 200);
  });
  socket.on("timeout", () => {
    console.error(`❌ Timeout`);
    lastPrintStatus = "timeout";
    job.res.end(JSON.stringify({ error: "Timeout" }));
    socket.destroy();
    isPrinting = false;
    setTimeout(processQueue, 200);
  });
}

// ==========================
// INICIO
// ==========================

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   🖨️  Kablam Print Agent v1.0       ║`);
  console.log(`║                                      ║`);
  console.log(`║   Abrí en tu navegador:              ║`);
  console.log(`║   → http://localhost:${PORT}            ║`);
  console.log(`║                                      ║`);
  console.log(`║   En Admin/configurá:                ║`);
  console.log(`║   Tipo: Red (IP)                     ║`);
  console.log(`║   IP: 127.0.0.1                      ║`);
  console.log(`║   Puerto: ${PORT}                       ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
