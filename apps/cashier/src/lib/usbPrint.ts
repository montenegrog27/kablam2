// WebUSB printer connection for the cashier browser
// This connects to USB thermal printers configured in the admin

type USBPrinter = {
  id: string;
  name: string;
  vendorId: number;
  productId: number;
};

let connectedDevices: Map<string, any> = new Map();

export async function getConnectedPrinters(configuredPrinters: USBPrinter[]): Promise<USBPrinter[]> {
  if (!(navigator as any).usb) {
    console.log("WebUSB no soportado");
    return [];
  }

  const usb = (navigator as any).usb;
  const authorizedDevices = await usb.getDevices();

  return configuredPrinters.filter((p) =>
    authorizedDevices.some((d: any) => d.vendorId === p.vendorId && d.productId === p.productId)
  );
}

export async function connectUSBPrinter(printer: USBPrinter): Promise<boolean> {
  if (!(navigator as any).usb) return false;

  try {
    const usb = (navigator as any).usb;
    const device = await usb.requestDevice({
      filters: [{ vendorId: printer.vendorId, productId: printer.productId }],
    });

    await device.open();
    await device.selectConfiguration(1);
    await device.claimInterface(0);

    connectedDevices.set(printer.id, device);
    return true;
  } catch (err) {
    console.error("Error conectando impresora USB:", err);
    return false;
  }
}

export async function printUSB(printerId: string, data: Uint8Array): Promise<boolean> {
  const device = connectedDevices.get(printerId);
  if (!device) return false;

  try {
    // Find the OUT endpoint
    const iface = device.configurations[0].interfaces[0];
    const endpoint = iface.alternate.endpoints.find((ep: any) => ep.direction === "out");
    if (!endpoint) return false;

    await device.transferOut(endpoint.endpointNumber, data);
    return true;
  } catch (err) {
    console.error("Error imprimiendo:", err);
    return false;
  }
}

export async function disconnectUSB(printerId: string) {
  const device = connectedDevices.get(printerId);
  if (device) {
    try { await device.close(); } catch {}
    connectedDevices.delete(printerId);
  }
}
