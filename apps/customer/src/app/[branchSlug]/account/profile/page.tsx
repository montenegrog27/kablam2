"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import ProdeProfile from "@/app/components/ProdeProfile";
import { describeLoyaltyRule, type LoyaltyRule } from "@/lib/loyalty";
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
  levels: Array<{ name: string; minPoints: number; maxPoints: number | null }>;
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
  const [loyaltyRules, setLoyaltyRules] = useState<LoyaltyRule[]>([]);

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${branchSlug}/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, session, branchSlug, pathname, router]);

  useEffect(() => {
    if (!session) return;
    loadProfile();
    fetch(`/api/loyalty?branchSlug=${encodeURIComponent(branchSlug)}`)
      .then((response) => response.json())
      .then((data) => setLoyaltyRules(Array.isArray(data.rules) ? data.rules : []))
      .catch(() => setLoyaltyRules([]));
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
      levels: Array.isArray(s.levels) ? s.levels : [],
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
      <div className="customer-profile-red flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-red-400" size={32} />
      </div>
    );
  }

  if (!session || !profile) return null;

  const clubLevel = profile.level || "Mordisco";
  const clubProgress = Math.min(100, Math.max(0, profile.progress || 0));
  const clubLevels = profile.levels.length > 0
    ? profile.levels.map((item) => item.name)
    : ["Mordisco", "Doble Mordisco", "Mordisco XL", "Leyenda Mordisco"];

  return (
    <div className="customer-profile-red min-h-screen pb-10 text-[var(--profile-text)]">
      <section className="relative overflow-hidden border-b border-[#FF1A1A] px-5 pb-7 pt-8">
        <div className="profile-hero-bg absolute inset-0" />
        <div className="relative mx-auto max-w-5xl">
          {profileIsIncomplete && (
            <div className="mb-4 border border-[#FF1A1A] bg-[#0A0A0A] px-4 py-3 text-sm text-white">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle size={16} />
                Completa {incompleteFields.join(" y ")} para agilizar tus pedidos.
              </div>
            </div>
          )}

          <div className="profile-hero-card border p-5 sm:p-7">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-w-0 flex-col justify-between gap-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="relative shrink-0">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="group relative flex h-24 w-24 items-center justify-center overflow-hidden border border-[#FF1A1A] bg-black text-3xl font-black uppercase text-white sm:h-28 sm:w-28"
                      aria-label="Cambiar foto"
                    >
                      {profile.avatarUrl ? (
                        <img src={profile.avatarUrl} alt={profile.name || "Cliente"} className="h-full w-full object-cover" />
                      ) : (
                        (profile.name || "C").slice(0, 1).toUpperCase()
                      )}
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-[#FF1A1A] py-1.5 text-[10px] font-black uppercase tracking-wide opacity-0 transition duration-200 group-hover:opacity-100">
                        <Camera size={12} />
                        Foto
                      </span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center border border-[#FF1A1A] bg-black text-white transition duration-200 hover:bg-[#FF1A1A]"
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
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A0A0A0]">Member / {profile.name || "Sin nombre"}</p>
                    <h1 className="mt-2 max-w-3xl text-[42px] font-black uppercase leading-[0.84] tracking-[-0.055em] text-white sm:text-[72px]">
                      MORDISCO BURGER CLUB
                    </h1>
                    <p className="mt-4 max-w-xl text-sm font-black uppercase tracking-[0.18em] text-[#FF1A1A] sm:text-base">
                      Fast food. Slow obsession.
                    </p>

                    <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-bold text-[#A0A0A0]">
                      <span className="inline-flex items-center gap-1 border border-[#FF1A1A] px-3 py-1 uppercase">
                        <Phone size={13} />
                        {profile.phone}
                      </span>
                      {profile.email && (
                        <span className="inline-flex items-center gap-1 border border-[#FF1A1A] px-3 py-1 uppercase">
                          <Mail size={13} />
                          {profile.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="grid gap-5 border border-[#FF1A1A] bg-black p-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#A0A0A0]">Nivel actual</p>
                      <p className="mt-1 text-3xl font-black uppercase tracking-[-0.04em] text-white">{clubLevel}</p>
                    </div>
                    <ShieldCheck className="mt-1 text-[#FF1A1A]" size={28} />
                  </div>

                  <div className="mt-4 h-2 border border-[#FF1A1A] bg-black">
                    <div className="h-full bg-[#FF1A1A]" style={{ width: `${clubProgress}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#A0A0A0]">
                    {clubProgress}% hacia {profile.nextLevel || "el proximo nivel"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {clubLevels.map((level) => (
                    <ClubLevel key={level} label={level} active={level === clubLevel} />
                  ))}
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#A0A0A0]">Club stats</p>
                  <div className="mt-3 grid gap-2">
                    <Metric label="Pedidos" value={profile.totalOrders.toString()} />
                    <Metric label="Gastado" value={formatCurrency(profile.totalSpent)} />
                    <Metric label="Puntos" value={`${profile.points}`} />
                  </div>
                </div>
              </aside>
            </div>

            <div className="mt-5 grid gap-2 border-t border-[#FF1A1A] pt-5 sm:grid-cols-3">
              <button onClick={() => setSection("resumen")} className="club-cta">
                Ver actividad
              </button>
              <button onClick={() => setSection("datos")} className="club-cta">
                Mis datos
              </button>
              <button onClick={() => setSection("prode")} className="club-cta">
                Prode club
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="border border-[#FF1A1A] bg-black p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#A0A0A0]">Private area</p>
              <h2 className="mt-1 text-3xl font-black uppercase leading-none tracking-[-0.04em] text-white sm:text-5xl">
                {section === "resumen" ? "Actividad" : section === "datos" ? "Identidad" : "Prode"}
              </h2>
            </div>
            <div className="border border-[#FF1A1A] bg-black p-4 text-xs font-bold uppercase leading-5 text-[#A0A0A0] sm:max-w-xs">
              Beneficios, historial y datos personales.
              </div>
          </div>
        </div>
      </section>

      <nav className="mx-auto mb-4 grid max-w-5xl grid-cols-3 gap-2 px-5">
        <ProfileTab active={section === "resumen"} icon={ShoppingBag} label="Resumen" onClick={() => setSection("resumen")} />
        <ProfileTab active={section === "datos"} icon={User} label="Mis datos" showDot={profileIsIncomplete} onClick={() => setSection("datos")} />
        <ProfileTab active={section === "prode"} icon={Trophy} label="Prode" onClick={() => setSection("prode")} />
      </nav>

      <main className="mx-auto max-w-5xl px-5">
        {message && (
          <div className="mb-4 border border-[#FF1A1A] bg-black px-4 py-3 text-center text-sm font-bold uppercase text-white">
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
                  <button onClick={() => router.push(`/${branchSlug}/account/orders`)} className="text-xs font-bold uppercase text-[#FF1A1A]">
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
                        className="profile-info-row w-full border p-3 text-left transition hover:border-[var(--profile-accent)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-gray-100">Pedido #{order.id.slice(-6).toUpperCase()}</p>
                            <p className="mt-1 text-xs text-gray-500">{formatDate(order.created_at)} - {statusLabel(order.status)}</p>
                            <p className="mt-2 line-clamp-1 text-xs text-gray-400">
                              {order.items?.slice(0, 2).map((item) => `${item.quantity}x ${item.name}`).join(" + ") || "Pedido"}
                            </p>
                          </div>
                          <span className="text-2xl font-black text-white">{formatCurrency(order.total)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </AccountCard>

              {loyaltyRules.length > 0 && (
                <AccountCard title="Como sumar puntos" icon={Gift}>
                  <div className="space-y-2">
                    {loyaltyRules.slice(0, 6).map((rule) => (
                      <div key={rule.id} className="profile-info-row flex items-start gap-3 border p-3">
                        <span className="mt-1 h-2 w-2 shrink-0 bg-[#FF1A1A]" />
                        <div>
                          <p className="text-xs font-black uppercase text-white">{rule.name}</p>
                          <p className="mt-1 text-xs font-bold uppercase leading-5 text-[#A0A0A0]">
                            {describeLoyaltyRule(rule)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </AccountCard>
              )}
            </section>

            <section className="space-y-4">
              <AccountCard
                title="Direcciones"
                icon={MapPin}
                action={
                  <button onClick={() => router.push(`/${branchSlug}/account/addresses`)} className="text-xs font-bold uppercase text-[#FF1A1A]">
                    Gestionar
                  </button>
                }
              >
                {addresses.length === 0 ? (
                  <EmptyState icon={Home} title="Sin direcciones guardadas" text="Agrega casa, trabajo u otra direccion frecuente." />
                ) : (
                  <div className="space-y-2">
                    {defaultAddress && (
                      <div className="profile-favorite-address border p-3">
                        <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-[#FF1A1A]">
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
                      <div key={address.id} className="profile-info-row border p-3">
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
                className="profile-action-card flex w-full items-center justify-center gap-2 border py-3.5 text-sm font-bold uppercase text-[#A0A0A0] transition duration-200 hover:text-white"
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
                    <button onClick={() => setEditingDetails(false)} className="text-xs font-bold uppercase text-[#A0A0A0]">
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
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#A0A0A0]">
                      <Gift size={12} />
                      Cumpleanos
                    </p>
                    <input
                      type="date"
                      value={form.birthDate || ""}
                      onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                      className="profile-input w-full border px-4 py-3 text-sm text-white outline-none transition duration-200"
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 bg-[#FF1A1A] py-3 text-sm font-bold uppercase text-white transition duration-200 hover:bg-[#FF3030] disabled:opacity-50"
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
                  <button onClick={() => setEditingDetails(true)} className="text-xs font-bold uppercase text-[#FF1A1A]">
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
          <section className="mx-auto max-w-3xl overflow-hidden border border-[#FF1A1A] bg-black p-1">
            <div className="border border-[#FF1A1A] bg-black p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center border border-[#FF1A1A] bg-black text-[#FF1A1A]">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A0A0A0]">Nueva seccion</p>
                    <h2 className="text-lg font-black uppercase text-white">Prode Mordisco</h2>
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
    <div className="profile-metric border p-3 text-center">
      <p className="truncate text-sm font-black text-white sm:text-base">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[var(--profile-muted)]">{label}</p>
    </div>
  );
}

function ClubLevel({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`border px-3 py-3 text-center text-xs font-black uppercase tracking-[-0.01em] ${active ? "border-[#FF1A1A] bg-[#FF1A1A] text-white" : "border-[#FF1A1A] bg-black text-[#A0A0A0]"}`}>
      {label}
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
    <div className="profile-card border p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-black uppercase tracking-[-0.02em] text-white">
          <Icon size={17} className="text-[var(--profile-accent)]" />
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
      className="profile-action-card group flex min-h-24 items-center gap-3 border p-4 text-left transition duration-200"
    >
      <div className="profile-icon-box flex h-11 w-11 flex-shrink-0 items-center justify-center border border-[#FF1A1A]">
        <Icon size={18} className="text-[var(--profile-accent-soft)]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-black uppercase tracking-[-0.02em] text-white">{label}</p>
        <p className="mt-1 text-xs text-[var(--profile-muted)]">{detail}</p>
      </div>
      <ChevronRight size={17} className="text-[var(--profile-muted)] transition group-hover:translate-x-0.5 group-hover:text-gray-300" />
    </button>
  );
}

function ProfileTab({
  active,
  icon: Icon,
  label,
  onClick,
  showDot,
}: {
  active: boolean;
  icon: any;
  label: string;
  onClick: () => void;
  showDot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "relative flex min-h-14 items-center justify-center gap-2 border px-2 text-xs font-black uppercase transition duration-200 sm:text-sm",
        active
          ? "profile-tab-active text-white"
          : "profile-tab-idle text-[var(--profile-muted)] hover:text-gray-100",
      ].join(" ")}
    >
      <Icon size={16} />
      <span className="truncate">{label}</span>
      {showDot && <span className="absolute right-2 top-2 h-2.5 w-2.5 bg-[#FF1A1A]" />}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-info-row flex items-center justify-between gap-3 border px-3 py-2.5">
      <span className="text-xs font-bold uppercase tracking-wide text-[var(--profile-muted)]">{label}</span>
      <span className="truncate text-sm font-semibold text-gray-200">{value}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="profile-empty border border-dashed p-5 text-center">
      <Icon size={28} className="mx-auto text-[var(--profile-muted)]" />
      <p className="mt-3 text-sm font-black text-gray-300">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--profile-muted)]">{text}</p>
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
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--profile-muted)]">
        <Icon size={12} />
        {label}
      </p>
      <input
        type={type || "text"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="profile-input w-full border px-4 py-3 text-sm text-gray-100 outline-none transition placeholder:text-gray-600 disabled:text-gray-500"
        disabled={disabled || !onChange}
      />
    </div>
  );
}
