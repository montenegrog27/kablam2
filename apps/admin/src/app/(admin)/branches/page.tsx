"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function BranchesPage() {

  const [branches, setBranches] = useState<any[]>([]);
  const [whatsapps, setWhatsapps] = useState<any[]>([]);
  const [waForm, setWaForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

    const { data: branchesData } = await supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id);

    const { data: whatsappData } = await supabase
      .from("whatsapp_numbers")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id);

    setBranches(branchesData || []);
    setWhatsapps(whatsappData || []);

  };

  const updateLocalBranch = (id: string, field: string, value: any) => {

    setBranches((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, [field]: value } : b
      )
    );

  };

  const saveBranch = async (branch: any) => {

    setSaving(true);

    await supabase
      .from("branches")
      .update({
        name: branch.name,
        lat: branch.lat,
        lng: branch.lng,
      })
      .eq("id", branch.id);

    setSaving(false);

  };

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

    await supabase
      .from("whatsapp_numbers")
      .upsert({
        tenant_id: branch.tenant_id,
        branch_id: branchId,
        phone_number: form.phone_number,
        phone_number_id: form.phone_number_id,
        access_token: form.access_token,
        waba_id: form.waba_id,
        verified: true,
      });

    alert("WhatsApp conectado correctamente");

    loadData();

  };

  return (

    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-bold">
        Sucursales
      </h1>

      {branches.map((branch) => {

        const whatsapp = getWhatsapp(branch.id);

        return (

          <div
            key={branch.id}
            className=" p-6 rounded-lg shadow space-y-6"
          >

            {/* BRANCH INFO */}

            <div className="space-y-4">

              <div>

                <label className="text-sm font-medium">
                  Nombre
                </label>

                <input
                  value={branch.name || ""}
                  onChange={(e) =>
                    updateLocalBranch(
                      branch.id,
                      "name",
                      e.target.value
                    )
                  }
                  className="w-full border p-2 rounded"
                />

              </div>

              <div className="grid grid-cols-2 gap-4">

                <div>

                  <label className="text-sm font-medium">
                    Latitud
                  </label>

                  <input
                    type="number"
                    value={branch.lat || ""}
                    onChange={(e) =>
                      updateLocalBranch(
                        branch.id,
                        "lat",
                        Number(e.target.value)
                      )
                    }
                    className="w-full border p-2 rounded"
                  />

                </div>

                <div>

                  <label className="text-sm font-medium">
                    Longitud
                  </label>

                  <input
                    type="number"
                    value={branch.lng || ""}
                    onChange={(e) =>
                      updateLocalBranch(
                        branch.id,
                        "lng",
                        Number(e.target.value)
                      )
                    }
                    className="w-full border p-2 rounded"
                  />

                </div>

              </div>

              <button
                onClick={() => saveBranch(branch)}
                disabled={saving}
                className="bg-black text-white px-4 py-2 rounded"
              >
                Guardar
              </button>

            </div>

            {/* WHATSAPP */}

            <div className="border-t pt-4 space-y-3">

              <h3 className="font-semibold">
                WhatsApp
              </h3>

              {whatsapp ? (

                <div className="flex items-center justify-between">

                  <div>

                    <div className="text-sm">
                      Número conectado
                    </div>

                    <div className="text-xs text-gray-500">
                      {whatsapp.phone_number}
                    </div>

                  </div>

                  <span className="text-green-600 text-sm">
                    ● Conectado
                  </span>

                </div>

              ) : (

                <div className="space-y-3">

                  <input
                    placeholder="Phone Number ID"
                    className="w-full border p-2 rounded"
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
                    className="w-full border p-2 rounded"
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