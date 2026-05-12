"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Printer, Search, Radio, Plus, Trash2, Star } from "lucide-react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function PrintersPage() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [kitchens, setKitchens] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [detectedDevices, setDetectedDevices] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [usbError, setUsbError] = useState("");

  const [name, setName] = useState("");
  const [type, setType] = useState("network");
  const [ip, setIp] = useState("");
  const [kitchenId, setKitchenId] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;
    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id);

    const { data: printersData } = await supabase
      .from("printers")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .eq("branch_id", userRecord.branch_id);
    setPrinters(printersData || []);

    const { data: kitchensData } = await supabase
      .from("kitchens")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .eq("branch_id", userRecord.branch_id);
    setKitchens(kitchensData || []);
  };

  const scanUSB = async () => {
    setUsbError("");
      setScanning(true);
      try {
        // Intentar con WebUSB API
        const usb = (navigator as any).usb;
        if (!usb) {
        setUsbError("WebUSB no soportado. Usá Chrome, Edge u Opera.");
        setScanning(false);
        return;
      }

      // Obtener dispositivos ya autorizados
      let devices = await usb.getDevices();

      // Si no hay, pedir autorización
      if (devices.length === 0) {
        try {
          const device = await usb.requestDevice({ filters: [] });
          devices = [device];
        } catch (err: any) {
          if (err.name === "NotFoundError") {
            setUsbError("No se seleccionó ningún dispositivo.");
          } else {
            setUsbError("Error al detectar: " + err.message);
          }
          setScanning(false);
          return;
        }
      }

      const detected = devices.map((d: any) => ({
        name: d.productName || "Impresora USB",
        manufacturer: d.manufacturerName || "Desconocido",
        vendorId: d.vendorId,
        productId: d.productId,
      }));

      setDetectedDevices(detected);

      if (detected.length === 0) {
        setUsbError("No se detectaron impresoras USB.");
      }
    } catch (err: any) {
      setUsbError("Error: " + err.message);
    }
    setScanning(false);
  };

  const addDetectedPrinter = async (device: any) => {
    if (!tenantId || !branchId) return;

    const { error } = await supabase.from("printers").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name: device.name,
      type: "usb",
      usb_vendor_id: device.vendorId,
      usb_product_id: device.productId,
      is_default: printers.length === 0,
    });

    if (error) {
      alert("Error al agregar impresora: " + error.message);
    } else {
      loadData();
    }
  };

  const setDefault = async (printer: any) => {
    await supabase.from("printers").update({ is_default: false }).eq("tenant_id", tenantId).eq("branch_id", branchId);
    await supabase.from("printers").update({ is_default: true }).eq("id", printer.id);
    loadData();
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !branchId || !name) return;

    const { data: printer } = await supabase
      .from("printers")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        name,
        type,
        ip_address: type === "network" ? ip : null,
        is_default: printers.length === 0,
      })
      .select()
      .single();

    if (kitchenId && printer) {
      await supabase.from("kitchen_printers").insert({
        tenant_id: tenantId,
        kitchen_id: kitchenId,
        printer_id: printer.id,
      });
    }

    setName(""); setIp(""); setKitchenId("");
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar impresora?")) return;
    await supabase.from("printers").delete().eq("id", id);
    loadData();
  };

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Impresoras</h1>

      {/* Detección USB */}
      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Detección USB</h2>
            <p className="text-sm text-gray-500">Conectá la impresora por USB y escaneá</p>
          </div>
          <button
            onClick={scanUSB}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 transition text-sm"
          >
            <Radio size={16} className={scanning ? "animate-pulse" : ""} />
            {scanning ? "Escaneando..." : "Detectar"}
          </button>
        </div>

        {usbError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3">{usbError}</div>
        )}

        {detectedDevices.length > 0 && (
          <div className="space-y-2">
            {detectedDevices.map((dev, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border">
                <div className="flex items-center gap-3">
                  <Printer size={20} className="text-gray-600" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">{dev.name}</p>
                    <p className="text-xs text-gray-500">{dev.manufacturer} — VID:{dev.vendorId} PID:{dev.productId}</p>
                  </div>
                </div>
                <button
                  onClick={() => addDetectedPrinter(dev)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus size={14} /> Agregar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formulario manual */}
      <form onSubmit={handleCreate} className="bg-white border rounded-xl p-6 mb-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Agregar manualmente</h2>
        <div className="grid grid-cols-3 gap-4">
          <input className="border p-2 rounded text-sm" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="border p-2 rounded text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="network">Red (IP)</option>
            <option value="usb">USB</option>
            <option value="raspberry">Raspberry</option>
          </select>
          <select className="border p-2 rounded text-sm" value={kitchenId} onChange={(e) => setKitchenId(e.target.value)}>
            <option value="">Sin cocina</option>
            {kitchens.map((k) => (<option key={k.id} value={k.id}>{k.name}</option>))}
          </select>
        </div>
        {type === "network" && (
          <input className="border p-2 rounded text-sm w-full" placeholder="Dirección IP" value={ip} onChange={(e) => setIp(e.target.value)} />
        )}
        <button className="bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black text-sm">Agregar</button>
      </form>

      {/* Lista de impresoras */}
      <div className="space-y-3">
        {printers.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Printer size={40} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay impresoras configuradas</p>
          </div>
        )}
        {printers.map((printer) => (
          <div key={printer.id} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${printer.is_default ? "ring-2 ring-blue-400" : ""}`}>
            <div className="flex items-center gap-3">
              <Printer size={20} className={printer.is_default ? "text-blue-600" : "text-gray-500"} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{printer.name}</span>
                  {printer.is_default && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">Predeterminada</span>}
                </div>
                <p className="text-xs text-gray-500">
                  Tipo: {printer.type}
                  {printer.ip_address && <> — IP: {printer.ip_address}</>}
                  {printer.usb_vendor_id && <> — VID: {printer.usb_vendor_id}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!printer.is_default && (
                <button onClick={() => setDefault(printer)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-yellow-500" title="Predeterminada">
                  <Star size={16} />
                </button>
              )}
              <button onClick={() => handleDelete(printer.id)} className="p-2 rounded-lg hover:bg-gray-100 text-red-500">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
