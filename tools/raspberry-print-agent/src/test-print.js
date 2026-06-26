import "dotenv/config";
import fs from "node:fs/promises";
import { usb } from "usb";

const mode = process.env.PRINT_MODE || "device";
const devicePath = process.env.PRINT_DEVICE_PATH || "/dev/usb/lp0";
const vendorId = process.env.TEST_USB_VENDOR_ID;
const productId = process.env.TEST_USB_PRODUCT_ID;

const data = Buffer.from(
  "\x1b\x40\x1b\x61\x01KABLAM POS\nTEST IMPRESORA\n\x1b\x61\x00\nSi ves esto, la Raspberry imprime OK.\n\n\x1b\x64\x05\x1d\x56\x00",
  "binary",
);

if (mode === "usb") {
  if (!vendorId || !productId) throw new Error("Set TEST_USB_VENDOR_ID and TEST_USB_PRODUCT_ID for PRINT_MODE=usb");
  const device = usb.findByIds(Number(vendorId), Number(productId));
  if (!device) throw new Error("USB printer not found");
  device.open();
  const iface = device.interfaces[0];
  if (iface.isKernelDriverActive?.()) iface.detachKernelDriver();
  iface.claim();
  const endpoint = iface.endpoints.find((ep) => ep.direction === "out");
  if (!endpoint) throw new Error("USB output endpoint not found");
  await new Promise((resolve, reject) => endpoint.transfer(data, (error) => (error ? reject(error) : resolve())));
  iface.release(true, () => {});
  device.close();
} else {
  await fs.writeFile(devicePath, data);
}

console.log("Test print sent");
