"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Camera,
  CheckCircle2,
  ExternalLink,
  Eye,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

type Branch = {
  id: string;
  name: string;
};

type BranchCamera = {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  snapshot_url: string;
  location: string | null;
  active: boolean;
  sort_order: number;
  last_snapshot_at: string | null;
  last_snapshot_url: string | null;
  last_error: string | null;
};

const inputClass =
  "w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-red-500";

const emptyForm = {
  id: "",
  branch_id: "",
  name: "",
  snapshot_url: "",
  location: "",
  active: true,
  sort_order: "0",
};

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CamerasPage() {
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cameras, setCameras] = useState<BranchCamera[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [schemaMissing, setSchemaMissing] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const camerasByBranch = useMemo(() => {
    return branches.map((branch) => ({
      branch,
      cameras: cameras.filter((camera) => camera.branch_id === branch.id),
    }));
  }, [branches, cameras]);

  async function load() {
    setLoading(true);
    setMessage("");
    setSchemaMissing(false);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setLoading(false);
      return;
    }

    const { data: user } = await supabase.from("users").select("tenant_id").eq("id", auth.user.id).single();
    if (!user?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(user.tenant_id);

    const [{ data: branchRows }, { data: cameraRows, error: cameraError }] = await Promise.all([
      supabase.from("branches").select("id, name").eq("tenant_id", user.tenant_id).order("name"),
      supabase
        .from("branch_cameras")
        .select("*")
        .eq("tenant_id", user.tenant_id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
    ]);

    if (cameraError) {
      setSchemaMissing(cameraError.code === "PGRST205" || cameraError.message.toLowerCase().includes("schema cache"));
      setMessage(cameraError.message);
    }

    const nextBranches = (branchRows || []) as Branch[];
    setBranches(nextBranches);
    setCameras(((cameraRows || []) as BranchCamera[]) || []);
    setForm((current) => ({
      ...current,
      branch_id: current.branch_id || nextBranches[0]?.id || "",
    }));
    setLoading(false);
  }

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm({ ...emptyForm, branch_id: branches[0]?.id || "" });
  }

  function edit(camera: BranchCamera) {
    setForm({
      id: camera.id,
      branch_id: camera.branch_id,
      name: camera.name,
      snapshot_url: camera.snapshot_url,
      location: camera.location || "",
      active: camera.active,
      sort_order: String(camera.sort_order || 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !form.branch_id || !form.name.trim() || !form.snapshot_url.trim()) {
      setMessage("Sucursal, nombre y URL snapshot son obligatorios.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      tenant_id: tenantId,
      branch_id: form.branch_id,
      name: form.name.trim(),
      snapshot_url: form.snapshot_url.trim(),
      location: form.location.trim() || null,
      active: form.active,
      sort_order: Number(form.sort_order || 0),
      updated_at: new Date().toISOString(),
    };

    const query = form.id
      ? supabase.from("branch_cameras").update(payload).eq("id", form.id).eq("tenant_id", tenantId)
      : supabase.from("branch_cameras").insert(payload);

    const { error } = await query;
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(form.id ? "Camara actualizada." : "Camara vinculada.");
    resetForm();
    await load();
  }

  async function toggle(camera: BranchCamera) {
    await supabase
      .from("branch_cameras")
      .update({ active: !camera.active, updated_at: new Date().toISOString() })
      .eq("id", camera.id)
      .eq("tenant_id", tenantId);
    await load();
  }

  async function remove(camera: BranchCamera) {
    const ok = window.confirm(`Eliminar la camara "${camera.name}"?`);
    if (!ok) return;
    const { error } = await supabase.from("branch_cameras").delete().eq("id", camera.id).eq("tenant_id", tenantId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  }

  if (loading) return <div className="text-sm text-gray-500">Cargando camaras...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-400">Staff snapshots</p>
            <h1 className="mt-2 text-3xl font-black text-gray-100">Camaras por sucursal</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
              Vincula URLs de snapshot para que, cuando un empleado toque iniciar turno en Staff, el sistema guarde una foto
              del momento como evidencia de asistencia.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 bg-gray-950 px-4 py-2.5 text-sm font-black text-gray-200 hover:border-gray-500"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <p className="text-xs font-bold uppercase text-gray-500">Camaras activas</p>
            <p className="mt-2 text-3xl font-black text-gray-100">{cameras.filter((camera) => camera.active).length}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <p className="text-xs font-bold uppercase text-gray-500">Sucursales</p>
            <p className="mt-2 text-3xl font-black text-gray-100">{branches.length}</p>
          </div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
            <p className="text-xs font-bold uppercase text-gray-500">Ultima captura</p>
            <p className="mt-2 text-lg font-black text-gray-100">
              {formatDate(cameras.find((camera) => camera.last_snapshot_at)?.last_snapshot_at)}
            </p>
          </div>
        </div>

        {schemaMissing && (
          <div className="mt-4 rounded-xl border border-yellow-900/70 bg-yellow-950/30 p-4 text-sm text-yellow-100">
            Falta crear la tabla <strong>branch_cameras</strong>. Ejecuta <strong>add_branch_cameras.sql</strong> en Supabase.
          </div>
        )}

        {message && !schemaMissing && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-3 text-sm text-gray-300">{message}</div>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Camera size={18} className="text-red-400" />
              <h2 className="font-black text-gray-100">{form.id ? "Editar camara" : "Nueva camara"}</h2>
            </div>
            {form.id && (
              <button onClick={resetForm} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-bold text-gray-300">
                <Plus size={14} />
                Nueva
              </button>
            )}
          </div>

          <form onSubmit={save} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Sucursal</span>
              <select className={inputClass} value={form.branch_id} onChange={(event) => update("branch_id", event.target.value)}>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Nombre</span>
              <input className={inputClass} value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Entrada principal" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">URL snapshot</span>
              <input
                className={inputClass}
                value={form.snapshot_url}
                onChange={(event) => update("snapshot_url", event.target.value)}
                placeholder="https://camara.local/snapshot.jpg"
              />
              <p className="mt-1.5 text-xs leading-5 text-gray-500">
                Debe devolver una imagen JPG/PNG/WebP y ser accesible desde el backend de Staff.
              </p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Ubicacion o nota</span>
              <input className={inputClass} value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Mostrador, caja, cocina..." />
            </label>

            <div className="grid grid-cols-[1fr_110px] gap-3">
              <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5">
                <span className="text-sm font-bold text-gray-200">Activa</span>
                <input type="checkbox" checked={form.active} onChange={(event) => update("active", event.target.checked)} className="h-5 w-5 accent-red-600" />
              </label>
              <input className={inputClass} type="number" value={form.sort_order} onChange={(event) => update("sort_order", event.target.value)} placeholder="Orden" />
            </div>

            <button disabled={saving || schemaMissing} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50">
              <Save size={16} />
              {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Vincular camara"}
            </button>
          </form>
        </section>

        <section className="space-y-4">
          {camerasByBranch.map(({ branch, cameras: branchCameras }) => (
            <div key={branch.id} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
                <div>
                  <h2 className="font-black text-gray-100">{branch.name}</h2>
                  <p className="text-xs text-gray-500">{branchCameras.length} camaras vinculadas</p>
                </div>
              </div>

              {branchCameras.length === 0 ? (
                <div className="p-6 text-sm text-gray-500">Sin camaras para esta sucursal.</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {branchCameras.map((camera) => (
                    <article key={camera.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_180px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${camera.active ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : "border-gray-700 bg-gray-950 text-gray-400"}`}>
                            {camera.active ? <CheckCircle2 size={13} /> : <Power size={13} />}
                            {camera.active ? "Activa" : "Pausada"}
                          </span>
                          <h3 className="truncate text-lg font-black text-gray-100">{camera.name}</h3>
                        </div>
                        <p className="mt-1 text-sm text-gray-500">{camera.location || "Sin ubicacion"}</p>
                        <p className="mt-2 truncate text-xs text-gray-500" title={camera.snapshot_url}>{camera.snapshot_url}</p>
                        {camera.last_error ? (
                          <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">{camera.last_error}</p>
                        ) : (
                          <p className="mt-3 text-xs text-gray-500">Ultima captura: {formatDate(camera.last_snapshot_at)}</p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => edit(camera)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-200 hover:border-gray-500">
                            <Pencil size={14} />
                            Editar
                          </button>
                          <button onClick={() => toggle(camera)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-200 hover:border-gray-500">
                            <Power size={14} />
                            {camera.active ? "Pausar" : "Activar"}
                          </button>
                          <a href={camera.snapshot_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-200 hover:border-gray-500">
                            <ExternalLink size={14} />
                            Abrir URL
                          </a>
                          <button onClick={() => remove(camera)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/70 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-950/30">
                            <Trash2 size={14} />
                            Eliminar
                          </button>
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
                        {camera.last_snapshot_url ? (
                          <a href={camera.last_snapshot_url} target="_blank" rel="noreferrer" className="group block">
                            <img src={camera.last_snapshot_url} alt={camera.name} className="aspect-video w-full object-cover opacity-90 transition group-hover:opacity-100" loading="lazy" />
                          </a>
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-gray-600">
                            <Eye size={24} />
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
