"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [whatsapps, setWhatsapps] = useState<any[]>([]);

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [waForm, setWaForm] = useState<any>({});
  const [fontFiles, setFontFiles] = useState<Record<string, File>>({});
  const [fontsBucketExists, setFontsBucketExists] = useState<boolean | null>(
    null,
  );
  const [branchHours, setBranchHours] = useState<Record<string, any[]>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const checkFontsBucket = async () => {
      try {
        // Intentar listar archivos en el bucket 'fonts'
        // Si el bucket no existe, esto lanzará un error
        const { error } = await supabase.storage.from("fonts").list();
        if (error) throw error;
        setFontsBucketExists(true);
      } catch (error) {
        setFontsBucketExists(false);
      }
    };
    checkFontsBucket();
  }, []);

  /* =============================
     LOAD DATA
  ============================= */

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    const tenantId = userRecord.tenant_id;

    const { data: branchesData } = await supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", tenantId)
      .or("active.is.null,active.eq.true");

    const { data: settingsData } = await supabase
      .from("branch_settings")
      .select("*");

    const { data: whatsappData } = await supabase
      .from("whatsapp_numbers")
      .select("*")
      .eq("tenant_id", tenantId);

    const { data: hoursData } = await supabase
      .from("branch_hours")
      .select("*");

    setBranches(branchesData || []);
    setSettings(settingsData || []);
    setWhatsapps(whatsappData || []);

    // Group hours by branch_id
    const hoursMap: Record<string, any[]> = {};
    (hoursData || []).forEach((h: any) => {
      if (!hoursMap[h.branch_id]) hoursMap[h.branch_id] = [];
      hoursMap[h.branch_id].push(h);
    });
    setBranchHours(hoursMap);
  };

  /* =============================
     HELPERS
  ============================= */

  const getSettings = (branchId: string) => {
    return settings.find((s) => s.branch_id === branchId) || {};
  };

  const updateLocalBranch = (id: string, field: string, value: any) => {
    setBranches((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
  };

  const updateLocalSettings = (branchId: string, field: string, value: any) => {
    setSettings((prev) => {
      const exists = prev.find((s) => s.branch_id === branchId);

      if (exists) {
        return prev.map((s) =>
          s.branch_id === branchId ? { ...s, [field]: value } : s,
        );
      }

      return [...prev, { branch_id: branchId, [field]: value }];
    });
  };

  const parsePickupAddresses = (value: any) => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch {
        return value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
    }
    return [];
  };

  const cleanPickupAddresses = (value: any) =>
    parsePickupAddresses(value)
      .map((address) => address.trim())
      .filter(Boolean);

  const updatePickupAddress = (
    branchId: string,
    currentValue: any,
    index: number,
    value: string,
  ) => {
    const addresses = parsePickupAddresses(currentValue);
    addresses[index] = value;
    updateLocalSettings(branchId, "catalog_order_pickup_addresses", addresses);
  };

  const addPickupAddress = (branchId: string, currentValue: any) => {
    updateLocalSettings(branchId, "catalog_order_pickup_addresses", [
      ...parsePickupAddresses(currentValue),
      "",
    ]);
  };

  const removePickupAddress = (
    branchId: string,
    currentValue: any,
    index: number,
  ) => {
    updateLocalSettings(
      branchId,
      "catalog_order_pickup_addresses",
      parsePickupAddresses(currentValue).filter((_, i) => i !== index),
    );
  };

  /* =============================
      SAVE BRANCH
   ============================= */

  const saveBranch = async (branch: any) => {
    setSaving(true);

    await supabase
      .from("branches")
      .update({
        name: branch.name,
        slug: branch.slug,
      })
      .eq("id", branch.id);

    setSaving(false);
    alert("Sucursal guardada");
  };

  const deleteBranch = async (branch: any) => {
    const confirmed = window.confirm(
      `Eliminar la sucursal "${branch.name}"?\n\nSe ocultara de customer y no se podran tomar pedidos nuevos para esta sucursal. Los pedidos historicos se conservan.`,
    );

    if (!confirmed) return;

    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch(`/api/branches/${branch.id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const result = await response.json().catch(() => null);

    setSaving(false);

    if (!response.ok) {
      alert(
        "No se pudo eliminar la sucursal: " +
          (result?.details || result?.error || "error desconocido"),
      );
      return;
    }

    await loadData();
    alert("Sucursal eliminada");
  };

  /* =============================
      SAVE SETTINGS
   ============================= */

  const saveSettings = async (branchId: string) => {
    setSaving(true);
    const branchSettings = getSettings(branchId);

    try {
      const { error } = await supabase.from("branch_settings").upsert(
        {
          branch_id: branchId,
          logo_url: branchSettings.logo_url,
          loading_icon_url: branchSettings.loading_icon_url,
          primary_color: branchSettings.primary_color,
          secondary_color: branchSettings.secondary_color,
          background_color: branchSettings.background_color,
          brand_color: branchSettings.brand_color,
          accent_color: branchSettings.accent_color,
          font_family: branchSettings.font_family,
          font_url: branchSettings.font_url,
          instagram_url: branchSettings.instagram_url,
          website_url: branchSettings.website_url,
          web_open: branchSettings.web_open,
          web_closed_message: branchSettings.web_closed_message,
          favicon_url: branchSettings.favicon_url,
          meta_title: branchSettings.meta_title,
          meta_pixel_id: branchSettings.meta_pixel_id,
          ga4_measurement_id: branchSettings.ga4_measurement_id,
          meta_pixel_script: branchSettings.meta_pixel_script,
          ga4_script: branchSettings.ga4_script,
          catalog_order_whatsapp_phone:
            branchSettings.catalog_order_whatsapp_phone || null,
          catalog_order_deposit_enabled:
            branchSettings.catalog_order_deposit_enabled ?? false,
          catalog_order_deposit_percent: Number(
            branchSettings.catalog_order_deposit_percent || 50,
          ),
          catalog_order_transfer_alias:
            branchSettings.catalog_order_transfer_alias || null,
          catalog_order_instructions:
            branchSettings.catalog_order_instructions || null,
          catalog_order_show_delivery_address:
            branchSettings.catalog_order_show_delivery_address ?? true,
          catalog_order_show_pickup_addresses:
            branchSettings.catalog_order_show_pickup_addresses ?? false,
          catalog_order_pickup_addresses: cleanPickupAddresses(
            branchSettings.catalog_order_pickup_addresses,
          ),
          catalog_order_advance_days: Math.max(
            1,
            Number(branchSettings.catalog_order_advance_days || 10),
          ),
        },
        { onConflict: "branch_id" },
      );

      if (error) throw error;

      alert("Configuración guardada");
    } catch (error: any) {
      console.error(error);
      if (
        error?.message?.includes("column") &&
        error?.message?.includes("does not exist")
      ) {
        alert(
          "Error: Falta agregar columnas a la tabla branch_settings.\n\n" +
            "Ejecuta el SQL en add_meta_fields_to_branch_settings.sql y add_catalog_orders.sql:\n\n" +
            "ALTER TABLE branch_settings\n" +
            "ADD COLUMN IF NOT EXISTS loading_icon_url TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS favicon_url TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS meta_title TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS meta_pixel_script TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS ga4_script TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_whatsapp_phone TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_deposit_enabled BOOLEAN,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_deposit_percent NUMERIC,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_transfer_alias TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_instructions TEXT,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_show_delivery_address BOOLEAN,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_show_pickup_addresses BOOLEAN,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_pickup_addresses JSONB,\n" +
            "ADD COLUMN IF NOT EXISTS catalog_order_advance_days INTEGER;",
        );
      } else {
        alert("Error al guardar configuración: " + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  /* =============================
      FONT UPLOAD
   ============================= */

  const uploadFontFile = async (branchId: string) => {
    const file = fontFiles[branchId];
    if (!file) {
      alert("Selecciona un archivo de fuente primero");
      return;
    }

    const validExtensions = [".woff", ".woff2", ".ttf", ".otf"];
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      alert("Formato no válido. Usa .woff, .woff2, .ttf o .otf");
      return;
    }

    setSaving(true);
    try {
      const fileName = `${crypto.randomUUID()}${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("fonts")
        .upload(fileName, file, {
          cacheControl: "31536000",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("fonts").getPublicUrl(fileName);

      const fontUrl = data.publicUrl;
      updateLocalSettings(branchId, "font_url", fontUrl);

      // Si font_family está vacío, sugerir nombre basado en el archivo
      const currentSettings = getSettings(branchId);
      if (
        !currentSettings.font_family ||
        currentSettings.font_family.trim() === ""
      ) {
        const baseName = file.name.replace(/\.[^/.]+$/, ""); // Quitar extensión
        const suggestedName = baseName
          .replace(/[-_]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (suggestedName) {
          updateLocalSettings(branchId, "font_family", suggestedName);
        }
      }

      alert(
        "Fuente subida correctamente. No olvides hacer clic en 'Guardar configuración' para aplicar los cambios.",
      );
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("Bucket not found")) {
        alert(
          "Bucket 'fonts' no encontrado. Por favor, crea el bucket en Supabase Storage:\n\n" +
            "1. Ve a Supabase Dashboard → Storage\n" +
            "2. Crea un nuevo bucket llamado 'fonts'\n" +
            "3. Configura como público (public)\n" +
            "4. O ejecuta el SQL en create_fonts_bucket.sql",
        );
      } else {
        alert("Error al subir la fuente: " + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  /* =============================
      WHATSAPP
   ============================= */

  const getWhatsapp = (branchId: string) => {
    return whatsapps.find((w) => w.branch_id === branchId);
  };

  const verifyWhatsapp = async (branchId: string) => {
    const form = waForm[branchId];

    if (!form?.phone_number_id || !form?.access_token) {
      alert("Completa los campos");
      return;
    }

    setVerifying(true);

    const res = await fetch("/api/whatsapp/verify", {
      method: "POST",
      body: JSON.stringify({
        phoneNumberId: form.phone_number_id,
        accessToken: form.access_token,
      }),
    });

    const data = await res.json();

    setVerifying(false);

    if (!data.success) {
      alert(data.error);
      return;
    }

    setWaForm((prev: any) => ({
      ...prev,
      [branchId]: {
        ...form,
        phone_number: data.phone_number,
        waba_id: data.waba_id,
        verified: true,
      },
    }));

    alert("Número verificado correctamente");
  };

  const saveWhatsapp = async (branchId: string) => {
    const form = waForm[branchId];

    if (!form?.verified) {
      alert("Primero verifica el número");
      return;
    }

    const branch = branches.find((b) => b.id === branchId);

    await supabase.from("whatsapp_numbers").upsert({
      tenant_id: branch.tenant_id,
      branch_id: branchId,
      phone_number: form.phone_number,
      phone_number_id: form.phone_number_id,
      access_token: form.access_token,
      waba_id: form.waba_id,
      verified: true,
    });

    alert("WhatsApp conectado");

    loadData();
  };

  /* =============================
     BRANCH HOURS HELPERS
   ============================= */

  const saveBranchHour = async (branchId: string, day: number, field: string, value: string) => {
    const existing = (branchHours[branchId] || []).find((h: any) => h.day_of_week === day);
    if (existing) {
      await supabase.from("branch_hours").update({ [field]: value }).eq("id", existing.id);
    } else {
      const data: any = { branch_id: branchId, day_of_week: day, open_time: "09:00", close_time: "23:00" };
      data[field] = value;
      await supabase.from("branch_hours").insert(data);
    }
    // Reload hours
    const { data: hoursData } = await supabase.from("branch_hours").select("*");
    const hoursMap: Record<string, any[]> = {};
    (hoursData || []).forEach((h: any) => {
      if (!hoursMap[h.branch_id]) hoursMap[h.branch_id] = [];
      hoursMap[h.branch_id].push(h);
    });
    setBranchHours(hoursMap);
  };

  const toggleBranchHourClosed = async (branchId: string, day: number, existing: any) => {
    if (existing) {
      await supabase.from("branch_hours").update({ is_closed: !existing.is_closed }).eq("id", existing.id);
    } else {
      await supabase.from("branch_hours").insert({
        branch_id: branchId, day_of_week: day, open_time: "09:00", close_time: "23:00", is_closed: true,
      });
    }
    const { data: hoursData } = await supabase.from("branch_hours").select("*");
    const hoursMap: Record<string, any[]> = {};
    (hoursData || []).forEach((h: any) => {
      if (!hoursMap[h.branch_id]) hoursMap[h.branch_id] = [];
      hoursMap[h.branch_id].push(h);
    });
    setBranchHours(hoursMap);
  };

  /* =============================
     UI
   ============================= */

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold">Sucursales</h1>

      {branches.map((branch) => {
        const branchSettings = getSettings(branch.id);
        const whatsapp = getWhatsapp(branch.id);

        return (
          <div key={branch.id} className="bg-gray-900 border border-gray-700 shadow-sm rounded-xl p-6 space-y-6">
            {/* =============================
                BRANCH
            ============================= */}

            <div className="space-y-3">
              <h2 className="font-semibold text-lg">Sucursal</h2>

              <input
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branch.name || ""}
                placeholder="Nombre"
                onChange={(e) =>
                  updateLocalBranch(branch.id, "name", e.target.value)
                }
              />

              <input
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branch.slug || ""}
                placeholder="Slug"
                onChange={(e) =>
                  updateLocalBranch(branch.id, "slug", e.target.value)
                }
              />

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => saveBranch(branch)}
                  disabled={saving}
                  className="bg-black text-white px-4 py-2 rounded"
                >
                  Guardar sucursal
                </button>
                <button
                  onClick={() => deleteBranch(branch)}
                  disabled={saving}
                  className="border border-red-900 bg-red-950/30 text-red-300 px-4 py-2 rounded hover:bg-red-950/50"
                >
                  Eliminar sucursal
                </button>
              </div>
            </div>

            {/* =============================
                BRANDING
            ============================= */}

            <div className="space-y-3 border-t border-gray-700 pt-4">
              <h3 className="font-semibold">Branding</h3>

              <input
                placeholder="Logo URL"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.logo_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "logo_url", e.target.value)
                }
              />

              <input
                placeholder="URL del icono de carga (gira al iniciar la app)"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.loading_icon_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "loading_icon_url", e.target.value)
                }
              />
              <div className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 px-3 py-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-950">
                  {branchSettings.loading_icon_url || branchSettings.logo_url ? (
                    <img
                      src={branchSettings.loading_icon_url || branchSettings.logo_url}
                      alt="Preview loader"
                      className="h-8 w-8 animate-spin object-contain"
                    />
                  ) : (
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-700 border-t-white" />
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  Si queda vacio, customer usa el logo de la sucursal. Recomendado: PNG/SVG cuadrado con fondo transparente.
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <input
                  type="color"
                  value={branchSettings.primary_color || "#000000"}
                  onChange={(e) =>
                    updateLocalSettings(
                      branch.id,
                      "primary_color",
                      e.target.value,
                    )
                  }
                  className="w-full h-10 rounded-lg border border-gray-600 cursor-pointer p-0.5"
                />

                <input
                  type="color"
                  value={branchSettings.secondary_color || "#ffffff"}
                  onChange={(e) =>
                    updateLocalSettings(
                      branch.id,
                      "secondary_color",
                      e.target.value,
                    )
                  }
                  className="w-full h-10 rounded-lg border border-gray-600 cursor-pointer p-0.5"
                />

                <input
                  type="color"
                  value={branchSettings.background_color || "#ffffff"}
                  onChange={(e) =>
                    updateLocalSettings(
                      branch.id,
                      "background_color",
                      e.target.value,
                    )
                  }
                  className="w-full h-10 rounded-lg border border-gray-600 cursor-pointer p-0.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="color"
                  value={branchSettings.brand_color || "#FF6B35"}
                  onChange={(e) =>
                    updateLocalSettings(
                      branch.id,
                      "brand_color",
                      e.target.value,
                    )
                  }
                  className="w-full h-10 rounded-lg border border-gray-600 cursor-pointer p-0.5"
                />
                <input
                  type="color"
                  value={branchSettings.accent_color || "#1A1A1A"}
                  onChange={(e) =>
                    updateLocalSettings(
                      branch.id,
                      "accent_color",
                      e.target.value,
                    )
                  }
                  className="w-full h-10 rounded-lg border border-gray-600 cursor-pointer p-0.5"
                />
              </div>

              <input
                placeholder="Fuente (ej: 'Inter, sans-serif')"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.font_family || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "font_family", e.target.value)
                }
              />
              <div className="text-xs text-gray-400 mb-2">
                Nombre de la familia de fuentes que se usará en CSS (ej:
                "Inter", "Roboto", "MiFuente"). Si subes una fuente
                personalizada, usa el mismo nombre aquí.
              </div>
              <input
                placeholder="URL de Google Fonts (opcional)"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.font_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "font_url", e.target.value)
                }
              />
              <div className="mt-2 p-3 border border-gray-700 rounded-lg bg-gray-800">
                <div className="text-sm font-medium mb-1">
                  Subir fuente personalizada (.woff, .ttf, .woff2, .otf)
                </div>

                {fontsBucketExists === false && (
                  <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                    <strong className="block font-semibold text-yellow-800">
                      ⚠️ Bucket "fonts" no encontrado
                    </strong>
                    <p className="text-yellow-700 mt-1">
                      Para subir fuentes, primero crea el bucket en Supabase
                      Storage:
                    </p>
                    <ol className="list-decimal pl-5 mt-1 text-yellow-700">
                      <li>Ve a Supabase Dashboard → Storage</li>
                      <li>Crea un nuevo bucket llamado "fonts"</li>
                      <li>Configura como público (public)</li>
                      <li>
                        O ejecuta el SQL en{" "}
                        <code className="bg-yellow-100 px-1 rounded">
                          create_fonts_bucket.sql
                        </code>
                      </li>
                    </ol>
                  </div>
                )}

                <input
                  type="file"
                  accept=".woff,.woff2,.ttf,.otf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFontFiles((prev) => ({ ...prev, [branch.id]: file }));
                    }
                  }}
                  className="w-full text-sm bg-gray-900 border border-gray-600 rounded-lg px-3 py-2"
                  disabled={fontsBucketExists === false}
                />
                <button
                  onClick={() => uploadFontFile(branch.id)}
                  disabled={saving || fontsBucketExists === false}
                  className="mt-2 bg-gray-800 text-white px-3 py-1 text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Subir fuente
                </button>
                {branchSettings.font_url && (
                  <div className="mt-2 text-xs text-gray-400">
                    URL actual:{" "}
                    <a
                      href={branchSettings.font_url}
                      target="_blank"
                      className="underline"
                    >
                      {branchSettings.font_url}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* =============================
                REDES
            ============================= */}

            <div className="space-y-3 border-t border-gray-700 pt-4">
              <h3 className="font-semibold">Redes</h3>

              <input
                placeholder="Instagram URL"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.instagram_url || ""}
                onChange={(e) =>
                  updateLocalSettings(
                    branch.id,
                    "instagram_url",
                    e.target.value,
                  )
                }
              />

              <input
                placeholder="Website URL"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.website_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "website_url", e.target.value)
                }
              />
            </div>

            {/* =============================
                SEO Y METADATOS
            ============================= */}

            <div className="space-y-3 border-t border-gray-700 pt-4">
              <h3 className="font-semibold">SEO y Metadatos</h3>

              <input
                placeholder="Título para la pestaña del navegador"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.meta_title || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "meta_title", e.target.value)
                }
              />
              <div className="text-xs text-gray-400">
                Este título aparece en la pestaña del navegador y en resultados
                de búsqueda
              </div>

              <input
                placeholder="URL del Favicon (icono de la pestaña)"
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                value={branchSettings.favicon_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "favicon_url", e.target.value)
                }
              />
              <div className="text-xs text-gray-400">
                Para iPhone y pantalla de inicio, usa un PNG cuadrado del logo
                de 180x180 px o 512x512 px. Si queda vacio, Customer intenta
                usar el icono de carga o el logo.
              </div>
            </div>

            {/* =============================
                TRACKING
            ============================= */}

            <div className="space-y-3 border-t border-gray-700 pt-4">
              <h3 className="font-semibold">Tracking</h3>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Meta Pixel ID
                </label>
                <input
                  placeholder="Fragmento de código del Meta Pixel"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                  value={branchSettings.meta_pixel_id || ""}
                  onChange={(e) =>
                    updateLocalSettings(
                      branch.id,
                      "meta_pixel_id",
                      e.target.value.replace(/\D/g, ""),
                    )
                  }
                />
                <div className="text-xs text-gray-400 mt-1">
                  Pega el código del pixel de Meta (eventos de conversión, etc.)
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  GA4 Measurement ID
                </label>
                <input
                  placeholder="Fragmento de código de GA4"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm uppercase text-gray-100 placeholder-gray-500"
                  value={branchSettings.ga4_measurement_id || ""}
                  onChange={(e) =>
                    updateLocalSettings(branch.id, "ga4_measurement_id", e.target.value.trim().toUpperCase())
                  }
                />
                <div className="text-xs text-gray-400 mt-1">
                  Pega el código de medición de Google Analytics 4
                </div>
              </div>
            </div>

            {/* =============================
                ESTADO WEB Y HORARIOS
            ============================= */}

            <div className="space-y-4 border-t border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-100">Estado Web y Horarios</h3>

              {/* Toggles principales */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ToggleSwitch
                  label="Web abierta"
                  description="Permite que los clientes vean el menú y hagan pedidos"
                  checked={branchSettings.web_open ?? true}
                  onChange={(v) => updateLocalSettings(branch.id, "web_open", v)}
                />
                <ToggleSwitch
                  label="Delivery habilitado"
                  description="Clientes pueden pedir delivery"
                  checked={branchSettings.delivery_enabled ?? true}
                  onChange={(v) => updateLocalSettings(branch.id, "delivery_enabled", v)}
                />
                <ToggleSwitch
                  label="Takeaway habilitado"
                  description="Clientes pueden pedir para retirar"
                  checked={branchSettings.takeaway_enabled ?? true}
                  onChange={(v) => updateLocalSettings(branch.id, "takeaway_enabled", v)}
                />
              </div>

              {/* Cierre temporal */}
              <details className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <summary className="text-sm font-medium text-gray-300 cursor-pointer hover:text-gray-100">⏸️ Cierre temporal</summary>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-gray-400">
                    <input
                      type="checkbox"
                      checked={!!branchSettings.web_closed_reason}
                      onChange={(e) => {
                        updateLocalSettings(branch.id, "web_closed_reason", e.target.checked ? "Mantenimiento" : null);
                        if (!e.target.checked) updateLocalSettings(branch.id, "web_closed_until", null);
                      }}
                      className="rounded border-gray-600"
                    />
                    Cerrar web temporalmente
                  </label>
                  {branchSettings.web_closed_reason !== null && branchSettings.web_closed_reason !== undefined && (
                    <>
                      <input
                        placeholder="Motivo (ej: estamos con demoras, perdon las molestias)"
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                        value={branchSettings.web_closed_reason || ""}
                        onChange={(e) => updateLocalSettings(branch.id, "web_closed_reason", e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Cerrar hasta:</span>
                        <input
                          type="datetime-local"
                          className="border border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-gray-900 text-gray-100"
                          value={branchSettings.web_closed_until ? branchSettings.web_closed_until.slice(0, 16) : ""}
                          onChange={(e) => updateLocalSettings(branch.id, "web_closed_until", e.target.value ? new Date(e.target.value).toISOString() : null)}
                        />
                        <button
                          onClick={() => {
                            updateLocalSettings(branch.id, "web_closed_until", null);
                            updateLocalSettings(branch.id, "web_closed_reason", null);
                          }}
                          className="text-xs text-gray-500 hover:text-gray-300 underline"
                        >
                          Quitar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </details>

              {/* Horarios por día */}
              <details className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <summary className="text-sm font-medium text-gray-300 cursor-pointer hover:text-gray-100">🕐 Horarios por día</summary>
                <div className="mt-3 space-y-2">
                  {[0,1,2,3,4,5,6].map((day) => {
                    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                    const hours = branchHours[branch.id]?.find((h: any) => h.day_of_week === day);
                    return (
                      <div key={day} className="flex items-center gap-3 text-sm bg-gray-900 rounded-lg px-3 py-2">
                        <span className="w-8 font-semibold text-gray-300">{dayNames[day]}</span>
                        {hours?.is_closed ? (
                          <span className="text-gray-500 italic">Cerrado</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input type="time" value={hours?.open_time?.slice(0, 5) || "09:00"}
                              onChange={(e) => saveBranchHour(branch.id, day, "open_time", e.target.value)}
                              className="border border-gray-600 rounded px-2 py-1 text-sm bg-gray-800 text-gray-100" />
                            <span className="text-gray-500">→</span>
                            <input type="time" value={hours?.close_time?.slice(0, 5) || "23:00"}
                              onChange={(e) => saveBranchHour(branch.id, day, "close_time", e.target.value)}
                              className="border border-gray-600 rounded px-2 py-1 text-sm bg-gray-800 text-gray-100" />
                          </div>
                        )}
                        <button
                          onClick={() => toggleBranchHourClosed(branch.id, day, hours)}
                          className={`ml-auto text-xs px-2 py-1 rounded font-medium ${hours?.is_closed ? "bg-emerald-700/30 text-emerald-300" : "bg-gray-700 text-gray-400 hover:bg-red-700/30 hover:text-red-300"}`}
                        >
                          {hours?.is_closed ? "Abrir" : "Cerrar"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </details>

              <details className="bg-gray-800 rounded-xl p-3 border border-gray-700" open>
                <summary className="text-sm font-medium text-gray-300 cursor-pointer hover:text-gray-100">
                  Catalogo y encargos
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-400">
                      WhatsApp receptor de la sucursal
                    </label>
                    <input
                      placeholder="Ej: 5492615551234"
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                      value={branchSettings.catalog_order_whatsapp_phone || ""}
                      onChange={(e) =>
                        updateLocalSettings(
                          branch.id,
                          "catalog_order_whatsapp_phone",
                          e.target.value,
                        )
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      A este numero llega el aviso interno de cada encargo.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-400">
                      Alias para transferencia
                    </label>
                    <input
                      placeholder="alias.del.local"
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                      value={branchSettings.catalog_order_transfer_alias || ""}
                      onChange={(e) =>
                        updateLocalSettings(
                          branch.id,
                          "catalog_order_transfer_alias",
                          e.target.value,
                        )
                      }
                    />
                  </div>

                  <ToggleSwitch
                    label="Requiere sena"
                    description="El cliente recibe el importe a transferir para confirmar"
                    checked={branchSettings.catalog_order_deposit_enabled ?? false}
                    onChange={(v) =>
                      updateLocalSettings(
                        branch.id,
                        "catalog_order_deposit_enabled",
                        v,
                      )
                    }
                  />

                  <ToggleSwitch
                    label="Pedir direccion de entrega"
                    description="Muestra el campo direccion en el formulario del cliente"
                    checked={branchSettings.catalog_order_show_delivery_address ?? true}
                    onChange={(v) =>
                      updateLocalSettings(
                        branch.id,
                        "catalog_order_show_delivery_address",
                        v,
                      )
                    }
                  />

                  <ToggleSwitch
                    label="Mostrar direcciones de retiro"
                    description="Permite que el cliente elija donde retirar"
                    checked={branchSettings.catalog_order_show_pickup_addresses ?? false}
                    onChange={(v) =>
                      updateLocalSettings(
                        branch.id,
                        "catalog_order_show_pickup_addresses",
                        v,
                      )
                    }
                  />

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-400">
                      Porcentaje de sena
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
                      value={branchSettings.catalog_order_deposit_percent ?? 50}
                      onChange={(e) =>
                        updateLocalSettings(
                          branch.id,
                          "catalog_order_deposit_percent",
                          e.target.value,
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-400">
                      Dias disponibles para encargar
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
                      value={branchSettings.catalog_order_advance_days ?? 10}
                      onChange={(e) =>
                        updateLocalSettings(
                          branch.id,
                          "catalog_order_advance_days",
                          e.target.value,
                        )
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Customer muestra solo hoy y los proximos dias configurados.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-xs font-semibold text-gray-400">
                        Direcciones de retiro
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          addPickupAddress(
                            branch.id,
                            branchSettings.catalog_order_pickup_addresses,
                          )
                        }
                        className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-gray-950"
                      >
                        Agregar direccion
                      </button>
                    </div>

                    <div className="space-y-2">
                      {parsePickupAddresses(
                        branchSettings.catalog_order_pickup_addresses,
                      ).map((address, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            placeholder="Ej: San Juan 635"
                            className="min-w-0 flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                            value={address}
                            onChange={(e) =>
                              updatePickupAddress(
                                branch.id,
                                branchSettings.catalog_order_pickup_addresses,
                                index,
                                e.target.value,
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              removePickupAddress(
                                branch.id,
                                branchSettings.catalog_order_pickup_addresses,
                                index,
                              )
                            }
                            className="rounded-lg border border-red-900 bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/60"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}

                      {parsePickupAddresses(
                        branchSettings.catalog_order_pickup_addresses,
                      ).length === 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            addPickupAddress(
                              branch.id,
                              branchSettings.catalog_order_pickup_addresses,
                            )
                          }
                          className="w-full rounded-lg border border-dashed border-gray-600 bg-gray-900/60 px-3 py-3 text-sm font-semibold text-gray-400 hover:border-gray-500 hover:text-gray-200"
                        >
                          Agregar primera direccion de retiro
                        </button>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-gray-500">
                      Si activas retiro, carga al menos una direccion para que el cliente pueda elegir.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-400">
                      Instrucciones extra para el cliente
                    </label>
                    <textarea
                      placeholder="Ej: Enviar comprobante por este chat. El pedido queda confirmado cuando validamos la transferencia."
                      className="min-h-24 w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                      value={branchSettings.catalog_order_instructions || ""}
                      onChange={(e) =>
                        updateLocalSettings(
                          branch.id,
                          "catalog_order_instructions",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              </details>

              <button
                onClick={() => saveSettings(branch.id)}
                className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-black border border-gray-700"
              >
                Guardar configuración
              </button>
            </div>

            {/* =============================
                WHATSAPP
            ============================= */}

            <div className="border-t pt-4 space-y-3">
              <h3 className="font-semibold">WhatsApp</h3>

              {whatsapp ? (
                <div className="text-green-600">
                  Conectado: {whatsapp.phone_number}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    placeholder="Phone Number ID"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                    onChange={(e) =>
                      setWaForm({
                        ...waForm,
                        [branch.id]: {
                          ...waForm[branch.id],
                          phone_number_id: e.target.value,
                        },
                      })
                    }
                  />

                  <input
                    placeholder="Access Token"
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-white/10 focus:border-gray-500 transition"
                    onChange={(e) =>
                      setWaForm({
                        ...waForm,
                        [branch.id]: {
                          ...waForm[branch.id],
                          access_token: e.target.value,
                        },
                      })
                    }
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => verifyWhatsapp(branch.id)}
                      disabled={verifying}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      Verificar
                    </button>

                    <button
                      onClick={() => saveWhatsapp(branch.id)}
                      className="bg-green-600 text-white px-4 py-2 rounded"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToggleSwitch({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 bg-gray-800 rounded-xl p-4 border border-gray-700 cursor-pointer hover:bg-gray-750 transition">
      <div className="relative mt-0.5">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-emerald-600" : "bg-gray-600"}`}>
          <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mt-1 ${checked ? "translate-x-5" : "translate-x-1"}`} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-100">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}
