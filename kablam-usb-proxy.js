const net = require("net");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const PORT = 9100;
const PRINTER_NAME = "POS Printer 203DPI Series";
const PRINTER_PORT = "USB005";

const server = net.createServer((socket) => {
  console.log(`📡 Cliente conectado`);
  const chunks = [];
  socket.on("data", (d) => chunks.push(d));
  socket.on("end", () => {
    const buffer = Buffer.concat(chunks);
    console.log(`📦 ${buffer.length} bytes recibidos`);

    const tmpFile = path.join(__dirname, `print_${Date.now()}.bin`);
    try {
      fs.writeFileSync(tmpFile, buffer);
      console.log(`📝 Archivo temporal creado`);

      // Método 1: copy directo al puerto USB
      exec(`copy /B "${tmpFile}" \\\\.\\${PRINTER_PORT}`, { timeout: 10000, shell: "cmd.exe" }, (err1, so1, se1) => {
        if (err1) {
          console.log(`⚠️ copy falló: ${err1.message}`);
          // Método 2: print /D:
          exec(`print /D:"${PRINTER_NAME}" "${tmpFile}"`, { timeout: 10000, shell: "cmd.exe" }, (err2) => {
            if (err2) {
              console.log(`⚠️ print /D: falló: ${err2.message}`);
              // Método 3: PowerShell Out-Printer
              const psCmd = `powershell -Command "Get-Content '${tmpFile}' -Encoding Byte | Out-Printer '${PRINTER_NAME}'"`;
              exec(psCmd, { timeout: 15000 }, (err3) => {
                if (err3) console.error(`❌ Todos los métodos fallaron`);
                else console.log(`✅ Impreso con PowerShell`);
                try { fs.unlinkSync(tmpFile); } catch {}
              });
            } else {
              console.log(`✅ Impreso con print /D:`);
              try { fs.unlinkSync(tmpFile); } catch {}
            }
          });
        } else {
          console.log(`✅ Impreso por copia directa a ${PRINTER_PORT}`);
          try { fs.unlinkSync(tmpFile); } catch {}
        }
      });
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
    }
    socket.destroy();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  🖨️  Kablam USB Proxy                ║`);
  console.log(`║  Puerto: ${PORT}                       ║`);
  console.log(`║  ${PRINTER_NAME}  ║`);
  console.log(`║  Puerto: ${PRINTER_PORT}                   ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
