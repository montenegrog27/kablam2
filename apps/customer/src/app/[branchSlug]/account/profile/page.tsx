"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import ProdeProfile from "@/app/components/ProdeProfile";
import {
  AlertCircle,
  Camera,
  ChevronRight,
  Gift,
  Home,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  Save,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trophy,
  User,
} from "lucide-react";

type Address = {
  id: string;
  alias: string;
  address: string;
  apartment?: string | null;
  floor?: string | null;
  is_default?: boolean;
};

type RecentOrder = {
  id: string;
  status: string;
  type?: string;
  total: number;
  created_at: string;
  items: Array<{ name: string; quantity: number }>;
};

type UserProfile = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  avatarUrl?: string | null;
  createdAt?: string;
  totalOrders: number;
  totalSpent: number;
  points: number;
  level: string;
  nextLevel: string;
  progress: number;
  recentOrders: RecentOrder[];
  favoriteProducts: Array<{ id: string; name: string; price: number }>;
};

type ProfileSection = "resumen" | "datos" | "prode";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    unconfirmed: "Pendiente",
    confirmed: "Confirmado",
    preparing: "En cocina",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  return labels[status] || status || "Pedido";
}

export default function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const branchSlug = pathname.split("/").filter(Boolean)[0];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [form, setForm] = useState({ name: "", email: "", birthDate: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [section, setSection] = useState<ProfileSection>("resumen");

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${branchSlug}/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, session, branchSlug, pathname, router]);

  useEffect(() => {
    if (!session) return;
    loadProfile();
  }, [session]);

  const loadProfile = async () => {
    setLoading(true);
    const [profileResponse, addressesResponse] = await Promise.all([
      fetch("/api/account/profile", { cache: "no-store" }),
      fetch("/api/account/addresses", { cache: "no-store" }),
    ]);

    const profileData = await profileResponse.json();
    const addressesData = addressesResponse.ok ? await addressesResponse.json() : { addresses: [] };
    const c = profileData.customer;
    const s = profileData.stats;

    const nextProfile: UserProfile = {
      id: c.id,
      name: c.name || "",
      phone: c.phone || session?.phone || "",
      email: c.email || "",
      birthDate: c.birthDate || "",
      avatarUrl: c.avatarUrl || null,
      createdAt: c.created_at,
      totalOrders: s.totalOrders || 0,
      totalSpent: s.totalSpent || 0,
      points: s.points || 0,
      level: s.level || "Novato",
      nextLevel: s.nextLevel || "Aprendiz",
      progress: s.progress || 0,
      recentOrders: profileData.orders || [],
      favoriteProducts: profileData.favorites || [],
    };

    setProfile(nextProfile);
    setAddresses(addressesData.addresses || []);
    setForm({
      name: nextProfile.name,
      email: nextProfile.email,
      birthDate: nextProfile.birthDate,
    });
    const isIncomplete = !nextProfile.name || !nextProfile.email;
    setEditingDetails(isIncomplete);
    if (isIncomplete) setSection("datos");
    setLoading(false);
  };

  const incompleteFields = useMemo(() => {
    const fields = [];
    if (!profile?.name) fields.push("nombre");
    if (!profile?.email) fields.push("email");
    return fields;
  }, [profile]);

  const profileIsIncomplete = incompleteFields.length > 0;
  const defaultAddress = addresses.find((address) => address.is_default) || addresses[0];

  const saveProfile = async () => {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setProfile((prev) => (prev ? { ...prev, ...form, birthDate: form.birthDate } : prev));
      setEditingDetails(false);
      setMessage("Datos guardados.");
      router.refresh();
    } else {
      const data = await res.json();
      setMessage(data.error || "No pudimos guardar tus datos.");
    }
    setSaving(false);
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setUploadingAvatar(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/account/avatar", {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (response.ok) {
      setProfile((prev) => (prev ? { ...prev, avatarUrl: data.avatarUrl } : prev));
      setMessage("Foto actualizada.");
    } else {
      setMessage(data.error || "No pudimos subir la foto.");
    }
    setUploadingAvatar(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <Loader2 className="animate-spin text-red-500" size={32} />
      </div>
    );
  }

  if (!session || !profile) return null;

  return (
    <div className="min-h-screen bg-gray-950 pb-10 text-gray-100">
      <section className="relative overflow-hidden px-5 pb-7 pt-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.32),transparent_32%),linear-gradient(180deg,#160808,#030712_78%)]" />
        <div className="relative mx-auto max-w-5xl">
          {profileIsIncomplete && (
            <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle size={16} />
                Completa {incompleteFields.join(" y ")} para agilizar tus pedidos.
              </div>
            </div>
          )}

          <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/15 bg-red-500/15 text-3xl font-black text-white shadow-xl"
                    aria-label="Cambiar foto"
                  >
                    {profile.avatarUrl ? (
                      <img src={profile.avatarUrl} alt={profile.name || "Cliente"} className="h-full w-full object-cover" />
                    ) : (
                      (profile.name || "C").slice(0, 1).toUpperCase()
                    )}
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1.5 text-[10px] font-black uppercase tracking-wide opacity-0 transition group-hover:opacity-100">
                      <Camera size={12} />
                      Foto
                    </span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-950 shadow-lg"
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => uploadAvatar(event.target.files?.[0])}
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-red-200/70">Mi cuenta</p>
                  <h1 className="mt-1 text-2xl font-black leading-tight text-white sm:text-4xl">
                    {profile.name || "Hola"}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-300">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-3 py-1">
                      <Phone size={13} />
                      {profile.phone}
                    </span>
                    {profile.email && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-3 py-1">
                        <Mail size={13} />
                        {profile.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:min-w-80">
                <Metric label="Pedidos" value={profile.totalOrders.toString()} />
                <Metric label="Gastado" value={formatCurrency(profile.totalSpent)} />
                <Metric label="Puntos" value={`${profile.points}`} />
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                <span>{profile.level}</span>
                <span>{profile.nextLevel}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400"
                  style={{ width: `${Math.min(100, profile.progress)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <nav className="mx-auto mb-4 grid max-w-5xl grid-cols-3 gap-2 px-5">
        <ProfileTab active={section === "resumen"} icon={ShoppingBag} label="Resumen" onClick={() => setSection("resumen")} />
        <ProfileTab active={section === "datos"} icon={User} label="Mis datos" showDot={profileIsIncomplete} onClick={() => setSection("datos")} />
        <ProfileTab active={section === "prode"} icon={Trophy} label="Prode" gold onClick={() => setSection("prode")} />
      </nav>

      <main className="mx-auto max-w-5xl px-5">
        {message && (
          <div className="mb-4 rounded-2xl border border-emerald-700/40 bg-emerald-900/30 px-4 py-3 text-center text-sm font-medium text-emerald-300">
            {message}
          </div>
        )}

        {section === "resumen" && (
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <ActionCard icon={ShoppingBag} label="Ver pedidos" detail={`${profile.totalOrders} pedidos`} href={`/${branchSlug}/account/orders`} />
                <ActionCard icon={MapPin} label="Direcciones" detail={`${addresses.length} guardadas`} href={`/${branchSlug}/account/addresses`} />
              </div>

              <AccountCard
                title="Ultimos pedidos"
                icon={Package}
                action={
                  <button onClick={() => router.push(`/${branchSlug}/account/orders`)} className="text-xs font-bold text-red-300">
                    Ver todos
                  </button>
                }
              >
                {profile.recentOrders.length === 0 ? (
                  <EmptyState icon={Package} title="Todavia no hiciste pedidos" text="Cuando compres, vas a ver tu historial aca." />
                ) : (
                  <div className="space-y-2">
                    {profile.recentOrders.slice(0, 4).map((order) => (
                      <button
                        key={order.id}
                        onClick={() => router.push(`/${branchSlug}/account/orders`)}
                        className="w-full rounded-2xl border border-gray-800 bg-gray-950/70 p-3 text-left transition hover:border-gray-700"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-100">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                            <p className="mt-1 text-xs text-gray-500">{formatDate(order.created_at)} - {statusLabel(order.status)}</p>
                            <p className="mt-2 line-clamp-1 text-xs text-gray-400">
                              {order.items?.slice(0, 2).map((item) => `${item.quantity}x ${item.name}`).join(" + ") || "Pedido"}
                            </p>
                          </div>
                          <span className="text-sm font-black text-emerald-300">{formatCurrency(order.total)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </AccountCard>
            </section>

            <section className="space-y-4">
              <AccountCard
                title="Direcciones"
                icon={MapPin}
                action={
                  <button onClick={() => router.push(`/${branchSlug}/account/addresses`)} className="text-xs font-bold text-red-300">
                    Gestionar
                  </button>
                }
              >
                {addresses.length === 0 ? (
                  <EmptyState icon={Home} title="Sin direcciones guardadas" text="Agrega casa, trabajo u otra direccion frecuente." />
                ) : (
                  <div className="space-y-2">
                    {defaultAddress && (
                      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
                        <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-red-200">
                          <Star size={13} />
                          Favorita
                        </div>
                        <p className="text-sm font-black text-white">{defaultAddress.alias}</p>
                        <p className="mt-1 text-xs leading-5 text-gray-400">
                          {defaultAddress.address}
                          {(defaultAddress.floor || defaultAddress.apartment) ? ` - Piso ${defaultAddress.floor || "-"} Dpto ${defaultAddress.apartment || "-"}` : ""}
                        </p>
                      </div>
                    )}
                    {addresses.filter((address) => address.id !== defaultAddress?.id).slice(0, 2).map((address) => (
                      <div key={address.id} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-3">
                        <p className="text-sm font-bold text-gray-100">{address.alias}</p>
                        <p className="mt-1 text-xs text-gray-500">{address.address}</p>
                      </div>
                    ))}
                  </div>
                )}
              </AccountCard>

              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.href = `/${branchSlug}`;
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-800 bg-gray-900 py-3.5 text-sm font-bold text-gray-400 transition hover:border-red-900/50 hover:text-red-400"
              >
                <LogOut size={16} />
                Cerrar sesion
              </button>
            </section>
          </div>
        )}

        {section === "datos" && (
          <section className="mx-auto max-w-2xl">
            {(profileIsIncomplete || editingDetails) ? (
              <AccountCard
                title={profileIsIncomplete ? "Completar datos" : "Editar datos"}
                icon={User}
                action={
                  !profileIsIncomplete ? (
                    <button onClick={() => setEditingDetails(false)} className="text-xs font-bold text-gray-500">
                      Cerrar
                    </button>
                  ) : null
                }
              >
                <div className="space-y-3">
                  <InputField label="Nombre" icon={User} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Tu nombre" />
                  <InputField label="Telefono" icon={Phone} value={profile.phone} disabled />
                  <InputField label="Email" icon={Mail} value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="tu@email.com" type="email" />
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
                      <Gift size={12} />
                      Cumpleanos
                    </p>
                    <input
                      type="date"
                      value={form.birthDate || ""}
                      onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                      className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition focus:border-red-500/50"
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Guardar datos
                  </button>
                </div>
              </AccountCard>
            ) : (
              <AccountCard
                title="Mis datos"
                icon={ShieldCheck}
                action={
                  <button onClick={() => setEditingDetails(true)} className="text-xs font-bold text-red-300">
                    Editar
                  </button>
                }
              >
                <div className="grid gap-2 text-sm">
                  <InfoRow label="Nombre" value={profile.name} />
                  <InfoRow label="Telefono" value={profile.phone} />
                  <InfoRow label="Email" value={profile.email} />
                  <InfoRow label="Cumpleanos" value={profile.birthDate || "Sin cargar"} />
                </div>
              </AccountCard>
            )}
          </section>
        )}

        {section === "prode" && (
          <section className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-amber-300/35 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.2),transparent_36%),linear-gradient(135deg,#241403,#09090b_62%)] p-1 shadow-2xl shadow-amber-950/20">
            <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-300 text-black shadow-lg shadow-amber-700/20">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200/70">Nueva seccion</p>
                    <h2 className="text-lg font-black text-amber-100">Prode Mordisco</h2>
                  </div>
                </div>
              </div>
              <ProdeProfile branchSlug={branchSlug} customerId={session?.customerId} tenantId={session?.tenantId} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center">
      <p className="truncate text-sm font-black text-white sm:text-base">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}

function AccountCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: any;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-gray-800 bg-gray-900/88 p-5 shadow-xl shadow-black/20">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-black text-gray-100">
          <Icon size={17} className="text-red-400" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function ActionCard({ icon: Icon, label, detail, href }: { icon: any; label: string; detail: string; href: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      className="group flex min-h-24 items-center gap-3 rounded-[22px] border border-gray-800 bg-gray-900 p-4 text-left transition hover:border-red-900/60 hover:bg-gray-800"
    >
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-red-600/20">
        <Icon size={18} className="text-red-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-gray-100">{label}</p>
        <p className="mt-1 text-xs text-gray-500">{detail}</p>
      </div>
      <ChevronRight size={17} className="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300" />
    </button>
  );
}

function ProfileTab({
  active,
  icon: Icon,
  label,
  onClick,
  showDot,
  gold,
}: {
  active: boolean;
  icon: any;
  label: string;
  onClick: () => void;
  showDot?: boolean;
  gold?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "relative flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-2 text-xs font-black transition sm:text-sm",
        active
          ? gold
            ? "border-amber-300/50 bg-amber-300 text-gray-950 shadow-lg shadow-amber-950/20"
            : "border-red-400/50 bg-red-600 text-white shadow-lg shadow-red-950/25"
          : "border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-gray-100",
      ].join(" ")}
    >
      <Icon size={16} />
      <span className="truncate">{label}</span>
      {showDot && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]" />}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-950/70 px-3 py-2.5">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      <span className="truncate text-sm font-semibold text-gray-200">{value}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-950/45 p-5 text-center">
      <Icon size={28} className="mx-auto text-gray-700" />
      <p className="mt-3 text-sm font-black text-gray-300">{title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-600">{text}</p>
    </div>
  );
}

function InputField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  disabled,
  type,
}: {
  label: string;
  icon: any;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500">
        <Icon size={12} />
        {label}
      </p>
      <input
        type={type || "text"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 focus:border-red-500/50 disabled:text-gray-500"
        disabled={disabled || !onChange}
      />
    </div>
  );
}
