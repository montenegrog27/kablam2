// Kablam Print Agent - Proxy de impresión local
// Corre en la PC del cajero, recibe datos ESC/POS desde el browser y los envía a la impresora
//
// USO:
// 1. Instalá Node.js en tu PC (https://nodejs.org)
// 2. Guardá este archivo como "print-agent.js"
// 3. Ejecutá: node print-agent.js
// 4. En Kablam Admin, configurá la impresora con IP = 127.0.0.1 y puerto = 9102

const net = require("net");
const http = require("http");

const HTTP_PORT = 9102;
const TCP_TIMEOUT = 10000;

let printQueue = [];
let isPrinting = false;

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }
  if (req.method !== "POST") { res.writeHead(405); res.end(JSON.stringify({ error: "Method not allowed" })); return; }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { data, printerIp, printerPort } = JSON.parse(body);

      if (!data) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Faltan datos: data (base64)" }));
        return;
      }

      const ip = printerIp || "127.0.0.1";
      const port = printerPort || 9100;
      const buffer = Buffer.from(data, "base64");

      console.log(`🖨️ Encolando impresión: ${ip}:${port} (${buffer.length} bytes)`);
      printQueue.push({ ip, port, buffer, res });
      processQueue();
    } catch (err) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

function processQueue() {
  if (isPrinting || printQueue.length === 0) return;
  isPrinting = true;
  const job = printQueue.shift();
  console.log(`🖨️ Enviando a ${job.ip}:${job.port} (${job.buffer.length} bytes)...`);

  const socket = new net.Socket();
  socket.setTimeout(TCP_TIMEOUT);
  socket.connect(job.port, job.ip, () => {
    socket.write(job.buffer, (err) => {
      if (err) {
        console.error(`❌ Error: ${err.message}`);
        job.res.end(JSON.stringify({ error: err.message }));
      } else {
        console.log(`✅ Impresión completada`);
        job.res.end(JSON.stringify({ success: true }));
      }
      socket.destroy();
      isPrinting = false;
      setTimeout(processQueue, 200);
    });
  });
  socket.on("error", (err) => {
    console.error(`❌ Error de conexión: ${err.message}`);
    job.res.end(JSON.stringify({ error: err.message }));
    socket.destroy();
    isPrinting = false;
    setTimeout(processQueue, 200);
  });
  socket.on("timeout", () => {
    console.error(`❌ Timeout`);
    job.res.end(JSON.stringify({ error: "Timeout" }));
    socket.destroy();
    isPrinting = false;
    setTimeout(processQueue, 200);
  });
}

server.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║     Kablam Print Agent              ║`);
  console.log(`║  http://0.0.0.0:${HTTP_PORT}               ║`);
  console.log(`║                                      ║`);
  console.log(`║  En Admin, configurá:                ║`);
  console.log(`║  Tipo: Red (IP)                      ║`);
  console.log(`║  IP: 127.0.0.1                       ║`);
  console.log(`║  Puerto: ${HTTP_PORT}                        ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
