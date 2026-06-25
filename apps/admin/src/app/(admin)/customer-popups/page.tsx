"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { CalendarDays, Eye, Image as ImageIcon, Pencil, Plus, Save, Trash2, X } from "lucide-react";

type CustomerPopup = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  active: boolean;
  show_promotions?: boolean | null;
  promotion_ids?: string[] | null;
  schedule_type: "all_days" | "specific_days";
  days_of_week?: number[] | null;
  starts_at?: string | null;
  ends_at?: string | null;
  priority: number;
  created_at?: string;
};

type Promotion = {
  id: string;
  name: string;
  description?: string | null;
  badge?: string | null;
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
};

type Branch = {
  id: string;
  name: string;
  slug?: string | null;
};

const weekdays = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

const emptyForm = {
  name: "",
  description: "",
  image_url: "",
  link_url: "",
  branch_id: "",
  active: true,
  show_promotions: false,
  promotion_ids: [] as string[],
  schedule_type: "all_days" as "all_days" | "specific_days",
  days_of_week: [] as number[],
  starts_at: "",
  ends_at: "",
  priority: "100",
};

export default function CustomerPopupsPage() {
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [popups, setPopups] = useState<CustomerPopup[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<CustomerPopup | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const activeCount = useMemo(() => popups.filter((popup) => popup.active).length, [popups]);

  async function loadData() {
    setLoading(true);
    setMessage("");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);

    const [branchesRes, popupsRes, promotionsRes] = await Promise.all([
      supabase.from("branches").select("id, name, slug").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("customer_popups").select("*").eq("tenant_id", userRecord.tenant_id).order("priority", { ascending: true }).order("created_at", { ascending: false }),
      supabase
        .from("promotions")
        .select("id, name, description, badge, active, start_date, end_date")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("active", true)
        .order("created_at", { ascending: false }),
    ]);

    if (popupsRes.error?.code === "42P01") {
      setMessage("Falta ejecutar add_customer_popups.sql en Supabase para activar esta seccion.");
    } else if (popupsRes.error) {
      setMessage(popupsRes.error.message);
    }

    setBranches((branchesRes.data || []) as Branch[]);
    setPromotions((promotionsRes.data || []) as Promotion[]);
    setPopups((popupsRes.data || []) as CustomerPopup[]);
    setLoading(false);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function editPopup(popup: CustomerPopup) {
    setEditingId(popup.id);
    setForm({
      name: popup.name || "",
      description: popup.description || "",
      image_url: popup.image_url || "",
      link_url: popup.link_url || "",
      branch_id: popup.branch_id || "",
      active: popup.active,
      show_promotions: Boolean(popup.show_promotions),
      promotion_ids: popup.promotion_ids || [],
      schedule_type: popup.schedule_type || "all_days",
      days_of_week: popup.days_of_week || [],
      starts_at: toDatetimeLocal(popup.starts_at),
      ends_at: toDatetimeLocal(popup.ends_at),
      priority: String(popup.priority || 100),
    });
    setShowForm(true);
  }

  async function savePopup(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !form.name.trim()) return;
    if (!form.show_promotions && !form.image_url.trim()) return;

    const selectedPromotions = promotions.filter((promotion) => form.promotion_ids.includes(promotion.id));
    if (form.show_promotions && selectedPromotions.length === 0) {
      setMessage("Selecciona al menos una promocion activa para mostrar en el popup.");
      return;
    }

    const promotionStartDates = selectedPromotions
      .map((promotion) => promotion.start_date)
      .filter(Boolean)
      .map((value) => new Date(value as string).getTime())
      .filter((value) => !Number.isNaN(value));
    const promotionEndDates = selectedPromotions
      .map((promotion) => promotion.end_date)
      .filter(Boolean)
      .map((value) => new Date(value as string).getTime())
      .filter((value) => !Number.isNaN(value));

    const payload = {
      tenant_id: tenantId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      image_url: form.show_promotions ? null : form.image_url.trim(),
      link_url: form.link_url.trim() || null,
      branch_id: form.branch_id || null,
      active: form.active,
      show_promotions: Boolean(form.show_promotions),
      promotion_ids: form.show_promotions ? form.promotion_ids.slice(0, 2) : [],
      schedule_type: form.schedule_type,
      days_of_week: form.schedule_type === "specific_days" ? form.days_of_week : null,
      starts_at: form.show_promotions && promotionStartDates.length
        ? new Date(Math.min(...promotionStartDates)).toISOString()
        : form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.show_promotions && promotionEndDates.length
        ? new Date(Math.max(...promotionEndDates)).toISOString()
        : form.ends_at ? new Date(form.ends_at).toISOString() : null,
      priority: Number(form.priority || 100),
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("customer_popups").update(payload).eq("id", editingId)
      : await supabase.from("customer_popups").insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetForm();
    loadData();
  }

  async function togglePopup(popup: CustomerPopup) {
    await supabase.from("customer_popups").update({ active: !popup.active, updated_at: new Date().toISOString() }).eq("id", popup.id);
    loadData();
  }

  async function deletePopup(id: string) {
    if (!confirm("Eliminar este popup?")) return;
    const { error } = await supabase.from("customer_popups").delete().eq("id", id);
    if (error) setMessage(error.message);
    loadData();
  }

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      days_of_week: current.days_of_week.includes(day)
        ? current.days_of_week.filter((value) => value !== day)
        : [...current.days_of_week, day],
    }));
  }

  function togglePromotion(promotionId: string) {
    setForm((current) => {
      const selected = current.promotion_ids.includes(promotionId)
        ? current.promotion_ids.filter((id) => id !== promotionId)
        : [...current.promotion_ids, promotionId].slice(0, 2);
      return { ...current, promotion_ids: selected };
    });
  }

  return (
    <div className="space-y-6">
      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid rgb(55 65 81);
          border-radius: 0.75rem;
          background: rgb(3 7 18);
          color: rgb(243 244 246);
          padding: 0.65rem 0.8rem;
          font-size: 0.875rem;
          outline: none;
        }

        .input::placeholder {
          color: rgb(107 114 128);
        }

        .input:focus {
          border-color: rgb(239 68 68);
        }
      `}</style>
      <header className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-400">Customer</p>
            <h1 className="mt-2 text-3xl font-black text-gray-100">Popups de entrada</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Configura modales visuales para mostrar en la app del cliente. Pueden aplicar todos los dias o solo dias especificos.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Stat label="Activos" value={String(activeCount)} />
            <Stat label="Creados" value={String(popups.length)} />
          </div>
        </div>
        {message && <div className="mt-4 rounded-xl border border-red-900/70 bg-red-950/40 px-4 py-3 text-sm text-red-200">{message}</div>}
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-100">Configuraciones</h2>
          <p className="text-sm text-gray-500">Si hay varios activos, customer muestra el de menor prioridad.</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-500">
          <Plus size={16} /> Nuevo popup
        </button>
      </div>

      {showForm && (
        <form onSubmit={savePopup} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-gray-100">{editingId ? "Editar popup" : "Nuevo popup"}</h3>
              <p className="text-sm text-gray-500">La imagen se muestra centrada y responsive sobre la web del cliente.</p>
            </div>
            <button type="button" onClick={resetForm} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre interno">
                  <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Promo finde, aviso feriado..." />
                </Field>
                <Field label="Sucursal">
                  <select className="input" value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })}>
                    <option value="">Todas las sucursales</option>
                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Descripcion opcional">
                <textarea className="input min-h-20" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Uso interno para identificar el popup." />
              </Field>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3">
                <span>
                  <span className="block text-sm font-black text-gray-100">Mostrar promociones activas</span>
                  <span className="text-xs text-gray-500">El popup usa hasta 2 promociones seleccionadas y vence junto con ellas.</span>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(form.show_promotions)}
                  onChange={(event) => setForm({ ...form, show_promotions: event.target.checked })}
                  className="h-5 w-5 accent-red-500"
                />
              </label>

              {form.show_promotions && (
                <div className="rounded-xl border border-red-950/60 bg-red-950/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-red-300">Promociones del popup</p>
                      <p className="mt-1 text-xs text-gray-500">Selecciona 1 o 2 promociones activas.</p>
                    </div>
                    <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-black text-red-200">
                      {form.promotion_ids.length}/2
                    </span>
                  </div>

                  {promotions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
                      No hay promociones activas para seleccionar.
                    </div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {promotions.map((promotion) => {
                        const selected = form.promotion_ids.includes(promotion.id);
                        const disabled = !selected && form.promotion_ids.length >= 2;
                        return (
                          <button
                            key={promotion.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => togglePromotion(promotion.id)}
                            className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              selected
                                ? "border-red-500 bg-red-600/15 text-white"
                                : "border-gray-800 bg-gray-950 text-gray-300 hover:border-gray-600"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-black">{promotion.name}</span>
                              {promotion.badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{promotion.badge}</span>}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-gray-500">{promotion.description || "Sin descripcion"}</p>
                            <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                              {promotion.end_date ? `Vence ${toDatetimeLocal(promotion.end_date).replace("T", " ")}` : "Sin vencimiento"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="URL de imagen">
                  <input className="input" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder={form.show_promotions ? "Opcional en modo promociones" : "https://..."} disabled={form.show_promotions} />
                </Field>
                <Field label="Link al hacer click opcional">
                  <input className="input" value={form.link_url} onChange={(event) => setForm({ ...form, link_url: event.target.value })} placeholder="https://... o /santafe1583/reservas" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Programacion">
                  <select className="input" value={form.schedule_type} onChange={(event) => setForm({ ...form, schedule_type: event.target.value as "all_days" | "specific_days" })}>
                    <option value="all_days">Todos los dias</option>
                    <option value="specific_days">Dias especificos</option>
                  </select>
                </Field>
                <Field label="Desde opcional">
                  <input type="datetime-local" className="input" value={form.starts_at} onChange={(event) => setForm({ ...form, starts_at: event.target.value })} />
                </Field>
                <Field label="Hasta opcional">
                  <input type="datetime-local" className="input" value={form.ends_at} onChange={(event) => setForm({ ...form, ends_at: event.target.value })} />
                </Field>
              </div>

              {form.schedule_type === "specific_days" && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Dias activos</p>
                  <div className="flex flex-wrap gap-2">
                    {weekdays.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${form.days_of_week.includes(day.value) ? "border-red-500 bg-red-600 text-white" : "border-gray-700 bg-gray-950 text-gray-400 hover:border-gray-500"}`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Prioridad">
                  <input type="number" className="input" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} />
                </Field>
                <label className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950 px-4 py-3 text-sm font-bold text-gray-200">
                  <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                  Activo
                </label>
              </div>

              <button className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-500">
                <Save size={16} /> Guardar popup
              </button>
            </div>

            <PopupPreview form={form} />
          </div>
        </form>
      )}

      <div className="grid gap-3">
        {loading ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">Cargando popups...</div>
        ) : popups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900 p-10 text-center text-sm text-gray-500">Todavia no hay popups creados.</div>
        ) : popups.map((popup) => (
          <div key={popup.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
                  {popup.image_url ? <img src={popup.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={24} className="text-gray-600" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-black text-gray-100">{popup.name}</h3>
                    <Badge>{popup.active ? "Activo" : "Pausado"}</Badge>
                    {popup.show_promotions && <Badge>Promociones</Badge>}
                    <Badge>{popup.schedule_type === "all_days" ? "Todos los dias" : formatDays(popup.days_of_week)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{popup.description || "Sin descripcion"}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <CalendarDays size={13} />
                    {branchName(branches, popup.branch_id)} · Prioridad {popup.priority}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => setPreview(popup)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white" title="Vista previa"><Eye size={17} /></button>
                <button onClick={() => togglePopup(popup)} className={`rounded-lg px-3 py-2 text-xs font-black ${popup.active ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>{popup.active ? "Activo" : "Pausado"}</button>
                <button onClick={() => editPopup(popup)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white" title="Editar"><Pencil size={17} /></button>
                <button onClick={() => deletePopup(popup.id)} className="rounded-lg p-2 text-red-300 hover:bg-red-950" title="Eliminar"><Trash2 size={17} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <PreviewModal popup={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 px-5 py-3">
      <p className="text-xl font-black text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] font-black uppercase text-gray-400">{children}</span>;
}

function PopupPreview({ form }: { form: typeof emptyForm }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-gray-500">Vista previa</p>
      <div className="rounded-3xl bg-black/80 p-4">
        <div className="mx-auto max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-white">
          {form.image_url ? (
            <img src={form.image_url} alt="" className="max-h-[420px] w-full object-contain" />
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-3 bg-gray-100 text-gray-400">
              <ImageIcon size={32} />
              <span className="text-sm font-bold">Cargá una URL de imagen</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ popup, onClose }: { popup: CustomerPopup; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white">
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-black/70 p-2 text-white hover:bg-black">
          <X size={18} />
        </button>
        {popup.image_url ? (
          <img src={popup.image_url} alt={popup.name} className="max-h-[82vh] w-full object-contain" />
        ) : (
          <div className="p-8 text-center text-sm font-bold text-gray-500">Popup de promociones</div>
        )}
      </div>
    </div>
  );
}

function branchName(branches: Branch[], branchId?: string | null) {
  if (!branchId) return "Todas las sucursales";
  return branches.find((branch) => branch.id === branchId)?.name || "Sucursal";
}

function formatDays(days?: number[] | null) {
  if (!days?.length) return "Sin dias";
  const map = new Map(weekdays.map((day) => [day.value, day.label]));
  return days.map((day) => map.get(day) || day).join(", ");
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
