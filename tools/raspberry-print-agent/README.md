# Kablam Raspberry Print Agent

Servicio local para Raspberry Pi. Escucha Supabase Realtime y manda comandas a una impresora USB cuando un pedido pasa de `confirmed` a `preparing`.

## Uso rapido en la Raspberry

```bash
sudo apt update
sudo apt install -y nodejs npm
mkdir -p ~/kablam
cd ~/kablam
```

Copiar esta carpeta `tools/raspberry-print-agent` a la Raspberry, luego:

```bash
npm install
cp .env.example .env
nano .env
npm run test-print
npm start
```

Para instalar como servicio:

```bash
sudo cp kablam-print-agent.service /etc/systemd/system/kablam-print-agent.service
sudo systemctl daemon-reload
sudo systemctl enable kablam-print-agent
sudo systemctl start kablam-print-agent
sudo journalctl -u kablam-print-agent -f
```

## Configuracion en Admin

En `Admin > Impresoras`, crear una impresora para la sucursal:

- Tipo: `Raspberry` o `USB`
- Activar `Imprimir comandas`
- Opcional: activar `Imprimir ticket cliente`
- Opcional: asignar categorias si esa impresora solo imprime cocina/barra

Si la impresora aparece como `/dev/usb/lp0`, usar:

```env
PRINT_MODE=device
PRINT_DEVICE_PATH=/dev/usb/lp0
```

Si no aparece `/dev/usb/lp0`, usar modo USB con VID/PID cargados en Admin:

```env
PRINT_MODE=usb
```

Comandos utiles:

```bash
lsusb
ls -l /dev/usb/
sudo usermod -aG lp pi
sudo reboot
```
