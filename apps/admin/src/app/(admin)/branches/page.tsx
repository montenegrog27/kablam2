"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

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
      .eq("tenant_id", tenantId);

    const { data: settingsData } = await supabase
      .from("branch_settings")
      .select("*");

    const { data: whatsappData } = await supabase
      .from("whatsapp_numbers")
      .select("*")
      .eq("tenant_id", tenantId);

    setBranches(branchesData || []);
    setSettings(settingsData || []);
    setWhatsapps(whatsappData || []);
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
            "Ejecuta el SQL en add_font_family_to_branch_settings.sql:\n\n" +
            "ALTER TABLE branch_settings\n" +
            "ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#FF6B35',\n" +
            "ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#1A1A1A',\n" +
            "ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Arial, sans-serif',\n" +
            "ADD COLUMN IF NOT EXISTS font_url TEXT;",
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
        .upload(fileName, file);

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
     UI
  ============================= */

  return (
    <div className="p-8 space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold">Sucursales</h1>

      {branches.map((branch) => {
        const branchSettings = getSettings(branch.id);
        const whatsapp = getWhatsapp(branch.id);

        return (
          <div key={branch.id} className="border rounded-xl p-6 space-y-6">
            {/* =============================
                BRANCH
            ============================= */}

            <div className="space-y-3">
              <h2 className="font-semibold text-lg">Sucursal</h2>

              <input
                className="border p-2 w-full rounded"
                value={branch.name || ""}
                placeholder="Nombre"
                onChange={(e) =>
                  updateLocalBranch(branch.id, "name", e.target.value)
                }
              />

              <input
                className="border p-2 w-full rounded"
                value={branch.slug || ""}
                placeholder="Slug"
                onChange={(e) =>
                  updateLocalBranch(branch.id, "slug", e.target.value)
                }
              />

              <button
                onClick={() => saveBranch(branch)}
                disabled={saving}
                className="bg-black text-white px-4 py-2 rounded"
              >
                Guardar sucursal
              </button>
            </div>

            {/* =============================
                BRANDING
            ============================= */}

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Branding</h3>

              <input
                placeholder="Logo URL"
                className="border p-2 w-full rounded"
                value={branchSettings.logo_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "logo_url", e.target.value)
                }
              />

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
                  className="w-full"
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
                  className="w-full"
                />
              </div>

              <input
                placeholder="Fuente (ej: 'Inter, sans-serif')"
                className="border p-2 w-full rounded"
                value={branchSettings.font_family || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "font_family", e.target.value)
                }
              />
              <div className="text-xs text-gray-500 mb-2">
                Nombre de la familia de fuentes que se usará en CSS (ej:
                "Inter", "Roboto", "MiFuente"). Si subes una fuente
                personalizada, usa el mismo nombre aquí.
              </div>
              <input
                placeholder="URL de Google Fonts (opcional)"
                className="border p-2 w-full rounded"
                value={branchSettings.font_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "font_url", e.target.value)
                }
              />
              <div className="mt-2 p-2 border rounded bg-gray-50">
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
                  className="w-full text-sm"
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
                  <div className="mt-2 text-xs text-gray-600">
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

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Redes</h3>

              <input
                placeholder="Instagram URL"
                className="border p-2 w-full rounded"
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
                className="border p-2 w-full rounded"
                value={branchSettings.website_url || ""}
                onChange={(e) =>
                  updateLocalSettings(branch.id, "website_url", e.target.value)
                }
              />
            </div>

            {/* =============================
                WEB STATUS
            ============================= */}

            <div className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Estado Web</h3>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={branchSettings.web_open ?? true}
                  onChange={(e) =>
                    updateLocalSettings(branch.id, "web_open", e.target.checked)
                  }
                />
                Web abierta
              </label>

              <input
                placeholder="Mensaje cuando está cerrado"
                className="border p-2 w-full rounded"
                value={branchSettings.web_closed_message || ""}
                onChange={(e) =>
                  updateLocalSettings(
                    branch.id,
                    "web_closed_message",
                    e.target.value,
                  )
                }
              />

              <button
                onClick={() => saveSettings(branch.id)}
                className="bg-black text-white px-4 py-2 rounded"
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
                    className="border p-2 w-full rounded"
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
                    className="border p-2 w-full rounded"
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
