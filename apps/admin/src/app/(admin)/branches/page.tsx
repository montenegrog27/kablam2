"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [whatsapps, setWhatsapps] = useState<any[]>([]);

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [waForm, setWaForm] = useState<any>({});

  useEffect(() => {
    loadData();
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
        lat: branch.lat,
        lng: branch.lng,
        slug: branch.slug,
      })
      .eq("id", branch.id);

    setSaving(false);
  };

  /* =============================
     SAVE SETTINGS
  ============================= */

const saveSettings = async (branchId: string) => {
  const data = settings.find((s) => s.branch_id === branchId);

  if (!data) return;

  await supabase
    .from("branch_settings")
    .upsert(
      {
        branch_id: branchId,
        logo_url: data.logo_url,
        primary_color: data.primary_color,
        secondary_color: data.secondary_color,
        background_color: data.background_color,
        instagram_url: data.instagram_url,
        website_url: data.website_url,
        web_open: data.web_open,
        web_closed_message: data.web_closed_message,
      },
      { onConflict: "branch_id" } // 🔥 CLAVE
    );

  alert("Configuración guardada");
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
          <div
            key={branch.id}
            className="border rounded-xl p-6 space-y-6"
          >
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
                    updateLocalSettings(branch.id, "primary_color", e.target.value)
                  }
                />

                <input
                  type="color"
                  value={branchSettings.secondary_color || "#ffffff"}
                  onChange={(e) =>
                    updateLocalSettings(branch.id, "secondary_color", e.target.value)
                  }
                />

                <input
                  type="color"
                  value={branchSettings.background_color || "#ffffff"}
                  onChange={(e) =>
                    updateLocalSettings(branch.id, "background_color", e.target.value)
                  }
                />
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
                  updateLocalSettings(branch.id, "instagram_url", e.target.value)
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