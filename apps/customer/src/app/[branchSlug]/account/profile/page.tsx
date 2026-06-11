"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Camera,
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
  Trophy,
  User,
} from "lucide-react";
import ProdeProfile from "@/app/components/ProdeProfile";
import { useAuth } from "@/hooks/useAuth";

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
  rewardsRedeemed: number;
  recentOrders: RecentOrder[];
  rewardCatalog: LoyaltyReward[];
  availableRedemptions: RewardRedemption[];
};

type ProfileSection = "club" | "pedidos" | "datos" | "prode";

const SOCIAL_STATUSES = [
  { name: "JOINED", minOrders: 0 },
  { name: "CREW", minOrders: 5 },
  { name: "SOCIAL CLUB", minOrders: 15 },
  { name: "BLACKLIST", minOrders: 30 },
  { name: "FOUNDER", minOrders: 60 },
] as const;

type LoyaltyReward = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  type: string;
  value?: number | null;
  imageUrl?: string | null;
  canRedeem: boolean;
};

type RewardRedemption = {
  id: string;
  rewardId?: string | null;
  name: string;
  description?: string | null;
  type?: string | null;
  value?: number | null;
  pointsCost: number;
  code?: string | null;
  status?: string | null;
  expires_at?: string | null;
};

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

function getMembershipStatus(totalOrders: number) {
  const currentIndex = SOCIAL_STATUSES.reduce((best, status, index) => {
    return totalOrders >= status.minOrders ? index : best;
  }, 0);
  const current = SOCIAL_STATUSES[currentIndex];
  const next = SOCIAL_STATUSES[currentIndex + 1] || null;
  const previousMin = current.minOrders;
  const nextMin = next?.minOrders ?? current.minOrders;
  const range = Math.max(1, nextMin - previousMin);
  const progress = next ? Math.min(100, Math.max(0, ((totalOrders - previousMin) / range) * 100)) : 100;
  const missingOrders = next ? Math.max(0, next.minOrders - totalOrders) : 0;

  return {
    current,
    currentIndex,
    next,
    progress: Math.round(progress),
    missingOrders,
  };
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
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editingDetails, setEditingDetails] = useState(false);
  const [section, setSection] = useState<ProfileSection>("club");
  const [unlockStatus, setUnlockStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${branchSlug}/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, session, branchSlug, pathname, router]);

  useEffect(() => {
    if (!session) return;
    loadProfile();
  }, [session]);

  useEffect(() => {
    if (!profile) return;
    const membership = getMembershipStatus(profile.totalOrders);
    const storageKey = `mordisco-social-status:${profile.id || profile.phone || branchSlug}`;
    const previous = window.localStorage.getItem(storageKey);
    const previousIndex = SOCIAL_STATUSES.findIndex((status) => status.name === previous);

    if (previous && previousIndex >= 0 && membership.currentIndex > previousIndex) {
      setUnlockStatus(membership.current.name);
      window.setTimeout(() => setUnlockStatus(null), 1700);
    }

    window.localStorage.setItem(storageKey, membership.current.name);
  }, [profile?.id, profile?.phone, profile?.totalOrders, branchSlug]);

  const loadProfile = async () => {
    setLoading(true);
    const [profileResponse, addressesResponse] = await Promise.all([
      fetch("/api/account/profile", { cache: "no-store" }),
      fetch("/api/account/addresses", { cache: "no-store" }),
    ]);

    const profileData = await profileResponse.json();
    const addressesData = addressesResponse.ok ? await addressesResponse.json() : { addresses: [] };
    const c = profileData.customer || {};
    const s = profileData.stats || {};

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
      rewardsRedeemed: s.rewardsRedeemed || 0,
      recentOrders: profileData.orders || [],
      rewardCatalog: profileData.rewardCatalog || [],
      availableRedemptions: profileData.availableRedemptions || [],
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
  const membership = getMembershipStatus(profile?.totalOrders || 0);

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

  const redeemReward = async (rewardId: string) => {
    setRedeemingRewardId(rewardId);
    setMessage("");

    const response = await fetch("/api/account/rewards/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardId }),
    });
    const data = await response.json();

    if (response.ok) {
      setMessage(data.code ? `Recompensa canjeada. Código: ${data.code}` : "Recompensa canjeada.");
      await loadProfile();
    } else {
      setMessage(data.error === "insufficient_points" ? "No tenés puntos suficientes para esta recompensa." : data.error || "No pudimos canjear la recompensa.");
    }

    setRedeemingRewardId(null);
  };

  if (authLoading || loading) {
    return (
      <div className="customer-profile-red flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-[#E10600]" size={32} />
      </div>
    );
  }

  if (!session || !profile) return null;

  return (
    <div className="customer-profile-red min-h-screen bg-[#E10600] text-white">
      <style jsx global>{`
        .profile-prode-shell section {
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
        }

        .profile-prode-shell .bg-gradient-to-r {
          background-image: none !important;
          background-color: #fff5f4 !important;
        }

        .profile-prode-shell .bg-emerald-600,
        .profile-prode-shell .hover\\:bg-emerald-500:hover,
        .profile-prode-shell .bg-amber-500 {
          background-color: #e10600 !important;
        }

        .profile-prode-shell .text-emerald-600,
        .profile-prode-shell .text-emerald-700,
        .profile-prode-shell .text-amber-500,
        .profile-prode-shell .text-amber-600,
        .profile-prode-shell .text-amber-800,
        .profile-prode-shell .text-red-600 {
          color: #e10600 !important;
        }

        .profile-prode-shell .border-amber-200,
        .profile-prode-shell .border-orange-200,
        .profile-prode-shell .border-emerald-100 {
          border-color: rgba(225, 6, 0, 0.18) !important;
        }
      `}</style>
      {unlockStatus && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#E10600] px-5 text-center text-white">
          <p className="text-sm font-black uppercase tracking-[0.35em]">Welcome to</p>
          <p className="mt-4 text-[54px] font-black uppercase leading-[0.82] tracking-[-0.06em] sm:text-[110px]">
            {unlockStatus}
          </p>
          <p className="mt-6 text-xl font-black uppercase tracking-[0.18em]">Unlocked</p>
        </div>
      )}

      <header className="sticky top-0 z-30 bg-[#E10600]/95 px-3 py-3 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/${branchSlug}/order`)}
            className="flex items-center gap-2 rounded-full bg-black px-4 py-2.5 text-left text-[10px] font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black"
          >
            <Home size={15} />
            Menu
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => uploadAvatar(event.target.files?.[0])}
          />

          <nav className="grid flex-1 grid-cols-4 gap-1 rounded-full bg-black p-1 sm:max-w-xl">
            <ProfileNavButton active={section === "club"} icon={ShieldCheck} label="Club" onClick={() => setSection("club")} />
            <ProfileNavButton active={section === "pedidos"} icon={ShoppingBag} label="Pedidos" onClick={() => setSection("pedidos")} />
            <ProfileNavButton active={section === "datos"} icon={User} label="Datos" showDot={profileIsIncomplete} onClick={() => setSection("datos")} />
            <ProfileNavButton active={section === "prode"} icon={Trophy} label="Prode" onClick={() => setSection("prode")} />
          </nav>

          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = `/${branchSlug}`;
            }}
            className="hidden items-center justify-center gap-2 rounded-full bg-black px-4 py-2.5 text-[10px] font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black sm:flex"
          >
            <LogOut size={15} />
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto min-h-screen max-w-7xl px-4 pb-12 pt-5 sm:px-7 lg:px-10 lg:pt-8">
          {profileIsIncomplete && (
            <div className="mb-5 rounded-3xl bg-white px-5 py-4 text-sm font-black uppercase text-black">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                Completa {incompleteFields.join(" y ")} para agilizar tus pedidos.
              </div>
            </div>
          )}

          {message && (
            <div className="mb-5 rounded-3xl bg-white px-5 py-4 text-center text-sm font-black uppercase text-black">
              {message}
            </div>
          )}

          {section === "club" && (
            <ClubSection
              profile={profile}
              membership={membership}
              uploadingAvatar={uploadingAvatar}
              onAvatarClick={() => fileInputRef.current?.click()}
              redeemingRewardId={redeemingRewardId}
              onRedeemReward={redeemReward}
            />
          )}

          {section === "pedidos" && <OrdersSection orders={profile.recentOrders} />}

          {section === "datos" && (
            <DetailsSection
              profile={profile}
              addresses={addresses}
              defaultAddress={defaultAddress}
              form={form}
              editingDetails={editingDetails}
              saving={saving}
              setEditingDetails={setEditingDetails}
              setForm={setForm}
              saveProfile={saveProfile}
              branchSlug={branchSlug}
              profileIsIncomplete={profileIsIncomplete}
            />
          )}

        {section === "prode" && (
          <section className="rounded-[32px] bg-white p-4 text-black sm:p-7">
            <SectionHeader kicker="Mordisco Games" title="Prode Mordisco" />
            <div className="profile-prode-shell mt-5 overflow-hidden rounded-3xl bg-white text-black">
              <ProdeProfile branchSlug={branchSlug} customerId={session.customerId} tenantId={session.tenantId} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ClubSection({
  profile,
  membership,
  uploadingAvatar,
  onAvatarClick,
  redeemingRewardId,
  onRedeemReward,
}: {
  profile: UserProfile;
  membership: ReturnType<typeof getMembershipStatus>;
  uploadingAvatar: boolean;
  onAvatarClick: () => void;
  redeemingRewardId: string | null;
  onRedeemReward: (rewardId: string) => void;
}) {
  const nextStatus = membership.next?.name || "MAX STATUS";

  return (
    <div className="space-y-6">
      <section className="py-4 text-white sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <div className="flex min-h-[58vh] flex-col justify-between gap-12 rounded-[36px] bg-black p-6 sm:p-9 lg:p-12">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.38em] text-white/55">Mordisco membership</p>
              <h1 className="mt-5 max-w-5xl text-[70px] font-black uppercase leading-[0.74] tracking-[-0.085em] text-white sm:text-[132px] lg:text-[176px]">
                Social<br />Club
              </h1>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.38em] text-white/55">Estatus actual</p>
              <p className="mt-3 text-[54px] font-black uppercase leading-[0.8] tracking-[-0.075em] text-[#E10600] sm:text-[96px] lg:text-[118px]">
                {membership.current.name}
              </p>
              <p className="mt-5 max-w-2xl text-base font-black uppercase leading-6 text-white/85 sm:text-xl">
                {profile.totalOrders} pedidos historicos
                {membership.next
                  ? ` / faltan ${membership.missingOrders} para ${membership.next.name}`
                  : " / rango maximo desbloqueado"}
              </p>
            </div>
          </div>

          <aside className="flex flex-col justify-between rounded-[36px] bg-white p-5 text-black sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.34em] text-black/45">Member card</p>
              <div className="mt-5 flex items-start gap-4">
              <button
                onClick={onAvatarClick}
                className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-[#E10600] text-3xl font-black uppercase text-white"
              >
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt={profile.name || "Cliente"} className="h-full w-full object-cover" />
                ) : (
                  (profile.name || "M").slice(0, 1).toUpperCase()
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black py-1.5 text-[9px] font-black uppercase text-white">
                  {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  Foto
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-black/45">Member</p>
                <p className="mt-2 text-2xl font-black uppercase leading-none tracking-[-0.05em]">{profile.name || "Miembro Mordisco"}</p>
                <p className="mt-3 inline-flex rounded-full bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white">{membership.current.name}</p>
              </div>
              </div>
            </div>

            <div className="mt-8 grid gap-2">
              <StatBlock value={String(profile.totalOrders)} label="Pedidos" />
              <StatBlock value={formatCurrency(profile.totalSpent)} label="Consumido" />
              <StatBlock value={String(profile.rewardsRedeemed)} label="Canjes" />
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[32px] bg-white p-5 text-black sm:p-7">
          <SectionHeader kicker="Status map" title="Ruta de estatus" />
          <div className="mt-7 grid gap-0">
            {SOCIAL_STATUSES.map((status, index) => (
              <StatusStep
                key={status.name}
                name={status.name}
                completed={index < membership.currentIndex}
                active={index === membership.currentIndex}
              />
            ))}
          </div>

          <div className="mt-8 rounded-[28px] bg-[#E10600] p-5 text-white sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-white/75">Proximo estatus</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-4xl font-black uppercase tracking-[-0.05em] text-white">{nextStatus}</p>
                <p className="mt-2 text-sm font-black uppercase text-white/75">
                  {membership.next ? `${profile.totalOrders} / ${membership.next.minOrders} pedidos` : "Status maximo"}
                </p>
              </div>
              <p className="text-5xl font-black uppercase tracking-[-0.05em] text-black">{membership.progress}%</p>
            </div>
            <div className="mt-5 grid grid-cols-12 gap-1">
              {Array.from({ length: 12 }).map((_, index) => (
                <span
                  key={index}
                  className={index < Math.round((membership.progress / 100) * 12) ? "h-5 rounded-full bg-black" : "h-5 rounded-full bg-white/35"}
                />
              ))}
            </div>
            <p className="mt-4 text-sm font-black uppercase leading-6 text-white">
              {membership.next
                ? `Te faltan ${membership.missingOrders} pedidos para entrar a ${membership.next.name}.`
                : "Ya desbloqueaste el estatus mas alto del club."}
            </p>
          </div>
        </div>

        <div className="rounded-[32px] bg-black p-5 text-white sm:p-7">
          <SectionHeader kicker="Puntos" title={`${profile.points} PTS`} />
          <p className="mt-2 text-sm font-bold uppercase text-white/65">Disponibles para canjear.</p>

          {profile.availableRedemptions.length > 0 && (
            <div className="mt-6 rounded-3xl bg-white p-4 text-black">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-black/45">Canjes activos</p>
              <div className="mt-3 space-y-2">
                {profile.availableRedemptions.map((redemption) => (
                  <div key={redemption.id} className="rounded-2xl bg-black p-3 text-white">
                    <p className="text-sm font-black uppercase">{redemption.name}</p>
                    {redemption.code && <p className="mt-1 text-lg font-black tracking-[0.12em] text-[#E10600]">{redemption.code}</p>}
                    {redemption.expires_at && <p className="mt-1 text-[10px] font-bold uppercase text-white/50">Vence {formatDate(redemption.expires_at)}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-3">
            {profile.rewardCatalog.length === 0 && (
              <div className="rounded-3xl bg-white/10 p-5 text-sm font-bold uppercase leading-6 text-white/70">
                Todavía no hay recompensas disponibles.
              </div>
            )}
            {profile.rewardCatalog.map((reward) => (
              <div key={reward.id} className="overflow-hidden rounded-3xl bg-white/10">
                {reward.imageUrl && <img src={reward.imageUrl} alt={reward.name} className="h-28 w-full object-cover" />}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl font-black uppercase tracking-[-0.04em] text-white">{reward.name}</p>
                      {reward.description && <p className="mt-1 text-xs font-bold uppercase leading-5 text-white/55">{reward.description}</p>}
                    </div>
                    <p className="shrink-0 text-sm font-black uppercase text-[#E10600]">{reward.pointsCost} pts</p>
                  </div>
                  <button
                    onClick={() => onRedeemReward(reward.id)}
                    disabled={!reward.canRedeem || redeemingRewardId === reward.id}
                    className="mt-4 flex w-full items-center justify-center rounded-full bg-[#E10600] py-3 text-xs font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                  >
                    {redeemingRewardId === reward.id ? "Canjeando..." : reward.canRedeem ? "Canjear" : "Faltan puntos"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function OrdersSection({ orders }: { orders: RecentOrder[] }) {
  return (
    <section className="rounded-[32px] bg-white p-4 text-black sm:p-7">
      <SectionHeader kicker="Historial" title="Mis pedidos" />
      {orders.length === 0 ? (
        <EmptyState icon={Package} title="Todavia no hiciste pedidos" text="Cuando compres, vas a ver tu actividad aca." />
      ) : (
        <div className="mt-5 grid gap-3">
          {orders.map((order) => (
            <article key={order.id} className="rounded-[28px] bg-black p-5 text-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-2xl font-black uppercase tracking-[-0.05em]">#{order.id.slice(-6).toUpperCase()}</p>
                  <p className="mt-1 text-xs font-black uppercase text-white/75">
                    {formatDate(order.created_at)} / {statusLabel(order.status)}
                  </p>
                  <p className="mt-3 text-sm font-bold uppercase leading-6 text-white/80">
                    {order.items?.map((item) => `${item.quantity}x ${item.name}`).join(" + ") || "Pedido"}
                  </p>
                </div>
                <p className="text-4xl font-black tracking-[-0.06em] text-[#E10600]">{formatCurrency(order.total)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailsSection({
  profile,
  addresses,
  defaultAddress,
  form,
  editingDetails,
  saving,
  setEditingDetails,
  setForm,
  saveProfile,
  branchSlug,
  profileIsIncomplete,
}: {
  profile: UserProfile;
  addresses: Address[];
  defaultAddress?: Address;
  form: { name: string; email: string; birthDate: string };
  editingDetails: boolean;
  saving: boolean;
  setEditingDetails: (editing: boolean) => void;
  setForm: Dispatch<SetStateAction<{ name: string; email: string; birthDate: string }>>;
  saveProfile: () => void;
  branchSlug: string;
  profileIsIncomplete: boolean;
}) {
  const router = useRouter();

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
      <div className="rounded-[32px] border border-black bg-black p-4 text-white sm:p-7">
        <SectionHeader kicker="Identidad" title="Mis datos" />

        {editingDetails || profileIsIncomplete ? (
          <div className="mt-5 space-y-4">
            <InputField label="Nombre" icon={User} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Tu nombre" />
            <InputField label="Telefono" icon={Phone} value={profile.phone} disabled />
            <InputField label="Email" icon={Mail} value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="tu@email.com" type="email" />
            <InputField label="Cumpleanos" icon={Gift} value={form.birthDate || ""} onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))} type="date" />
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-full bg-[#E10600] py-4 text-sm font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar
              </button>
              {!profileIsIncomplete && (
                <button
                  onClick={() => setEditingDetails(false)}
                  className="rounded-full border border-white/25 py-4 text-sm font-black uppercase text-white transition duration-200 hover:border-white hover:bg-white hover:text-black"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <InfoRow label="Nombre" value={profile.name} />
            <InfoRow label="Telefono" value={profile.phone} />
            <InfoRow label="Email" value={profile.email || "Sin cargar"} />
            <InfoRow label="Cumpleanos" value={profile.birthDate || "Sin cargar"} />
            <button
              onClick={() => setEditingDetails(true)}
              className="mt-2 w-full rounded-full bg-[#E10600] py-4 text-sm font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black"
            >
              Editar datos
            </button>
          </div>
        )}
      </div>

      <div className="rounded-[32px] border border-black bg-black p-4 text-white sm:p-7">
        <SectionHeader kicker="Direcciones" title="Mis lugares" />
        {addresses.length === 0 ? (
          <div className="mt-5">
            <EmptyState icon={MapPin} title="Sin direcciones guardadas" text="Agrega casa, trabajo u otra direccion frecuente." />
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {defaultAddress && (
              <AddressCard address={defaultAddress} label="Favorita" />
            )}
            {addresses.filter((address) => address.id !== defaultAddress?.id).map((address) => (
              <AddressCard key={address.id} address={address} />
            ))}
          </div>
        )}
        <button
          onClick={() => router.push(`/${branchSlug}/account/addresses`)}
          className="mt-4 w-full rounded-full bg-[#E10600] py-4 text-sm font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black"
        >
          Gestionar direcciones
        </button>
      </div>
    </section>
  );
}

function SectionHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header>
      <p className="text-xs font-black uppercase tracking-[0.32em] opacity-65">{kicker}</p>
      <h2 className="mt-2 text-4xl font-black uppercase leading-[0.9] tracking-[-0.055em] sm:text-6xl">
        {title}
      </h2>
    </header>
  );
}

function ProfileNavButton({
  active,
  icon: Icon,
  label,
  onClick,
  showDot,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  showDot?: boolean;
}) {
  const isProde = label.toLowerCase() === "prode";
  return (
    <button
      onClick={onClick}
      className={[
        "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-full px-2 text-[10px] font-black uppercase transition duration-200 lg:flex-row lg:justify-center lg:gap-2 lg:px-3 lg:text-xs",
        active
          ? isProde
            ? "bg-[#D6A100] text-black"
            : "bg-white text-black"
          : isProde
            ? "bg-black text-[#D6A100] hover:bg-[#D6A100] hover:text-black"
            : "bg-black text-white/75 hover:bg-white hover:text-black",
      ].join(" ")}
    >
      <Icon size={17} />
      <span className="truncate">{label}</span>
      {showDot && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#E10600]" />}
    </button>
  );
}

function StatusStep({ name, completed, active }: { name: string; completed: boolean; active: boolean }) {
  return (
    <div className={["grid grid-cols-[32px_1fr] items-center gap-3 border-b border-black/10 py-4 last:border-b-0", active || completed ? "text-black" : "text-black/35"].join(" ")}>
      <span className={["flex h-8 w-8 items-center justify-center rounded-full text-sm font-black", active || completed ? "bg-black text-white" : "bg-black/10 text-black/35"].join(" ")}>
        <span className={active || completed ? "h-2.5 w-2.5 rounded-full bg-white" : "h-2.5 w-2.5 rounded-full border border-black/35"} />
      </span>
      <div className="flex items-center gap-3">
        <span className="text-lg font-black uppercase tracking-[-0.04em] sm:text-2xl">{name}</span>
        <span className={["h-px flex-1", active || completed ? "bg-black" : "bg-black/25"].join(" ")} />
      </div>
    </div>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-3xl bg-black p-4 text-center">
      <p className="truncate text-xl font-black uppercase tracking-[-0.05em] text-white">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/75">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-white">
      <span className="text-xs font-black uppercase tracking-wide text-white/55">{label}</span>
      <span className="truncate text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function AddressCard({ address, label }: { address: Address; label?: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white p-4 text-black">
      {label && <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#E10600]">{label}</p>}
      <p className="text-lg font-black uppercase tracking-[-0.04em] text-black">{address.alias}</p>
      <p className="mt-1 text-sm font-bold uppercase leading-6 text-black/65">
        {address.address}
        {(address.floor || address.apartment) ? ` / Piso ${address.floor || "-"} Dpto ${address.apartment || "-"}` : ""}
      </p>
    </article>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-6 text-center text-white">
      <Icon size={30} className="mx-auto text-white/75" />
      <p className="mt-3 text-lg font-black uppercase tracking-[-0.04em] text-white">{title}</p>
      <p className="mt-2 text-sm font-bold uppercase leading-6 text-white/75">{text}</p>
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
  icon: LucideIcon;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
        <Icon size={12} />
        {label}
      </p>
      <input
        type={type || "text"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/15 bg-white px-4 py-3 text-base font-bold text-black outline-none transition duration-200 placeholder:text-black/35 focus:border-[#E10600] focus:ring-2 focus:ring-[#E10600]/35 disabled:bg-white/80 disabled:text-black/55"
        disabled={disabled || !onChange}
      />
    </div>
  );
}
