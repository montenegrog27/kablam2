"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  ChevronRight,
  Crown,
  Gift,
  Home,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Package,
  Phone,
  Save,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  User,
  X,
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
  order_number?: string;
  status: string;
  type?: string;
  total: number;
  subtotal?: number;
  shipping_cost?: number;
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
  { name: "BLACK", minOrders: 30 },
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

      <header className="sticky top-0 z-30 border-b border-black/10 bg-[#E10600]/95 px-3 py-3 text-white backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/${branchSlug}/order`)}
            className="flex h-11 items-center gap-2 rounded-full bg-black px-4 text-left text-[10px] font-black uppercase text-white transition duration-200 hover:bg-white hover:text-black"
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

          <button
            onClick={() => setSidebarOpen(true)}
            className="profile-sidebar-trigger flex h-11 flex-1 items-center justify-between rounded-full bg-black px-4 text-left sm:max-w-sm"
            aria-label="Abrir navegacion del perfil"
          >
            <span>
              <span className="block text-[9px] font-black uppercase tracking-[0.22em] opacity-45">Mordisco Club</span>
              <span className="block text-xs font-black uppercase">{profile.name || membership.current.name}</span>
            </span>
            <Menu size={18} />
          </button>

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

      <ProfileMobileSidebar
        open={sidebarOpen}
        section={section}
        setSection={setSection}
        onClose={() => setSidebarOpen(false)}
        profile={profile}
        membership={membership}
        profileIsIncomplete={profileIsIncomplete}
        branchSlug={branchSlug}
      />

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
            <div className="mb-5 rounded-3xl bg-black px-5 py-4 text-center text-sm font-black uppercase text-white">
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
              branchSlug={branchSlug}
            />
          )}

          {section === "pedidos" && <OrdersSection orders={profile.recentOrders} branchSlug={branchSlug} />}

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
            {/* <SectionHeader kicker="Mordisco Games" title="Prode Mordisco" /> */}
            <div className="profile-prode-shell mt-5 overflow-hidden rounded-3xl bg-white text-black">
              <ProdeProfile branchSlug={branchSlug} customerId={session.customerId} tenantId={session.tenantId} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ProfileMobileSidebar({
  open,
  section,
  setSection,
  onClose,
  profile,
  membership,
  profileIsIncomplete,
  branchSlug,
}: {
  open: boolean;
  section: ProfileSection;
  setSection: Dispatch<SetStateAction<ProfileSection>>;
  onClose: () => void;
  profile: UserProfile;
  membership: ReturnType<typeof getMembershipStatus>;
  profileIsIncomplete: boolean;
  branchSlug: string;
}) {
  const navItems: Array<{ id: ProfileSection; label: string; kicker: string; icon: LucideIcon; description: string; tone?: "gold" }> = [
    { id: "club", label: "Club", kicker: "Estatus", icon: ShieldCheck, description: membership.current.name },
    { id: "pedidos", label: "Pedidos", kicker: "Historial", icon: ShoppingBag, description: `${profile.totalOrders} pedidos` },
    { id: "datos", label: "Datos", kicker: "Identidad", icon: User, description: profileIsIncomplete ? "Completar perfil" : "Perfil listo" },
    { id: "prode", label: "Prode", kicker: "Mordisco Games", icon: Trophy, description: "Ranking y jugadas", tone: "gold" },
  ];

  const selectSection = (next: ProfileSection) => {
    setSection(next);
    onClose();
  };

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-black/70 transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={onClose}
      />

      <aside
        className={[
          "profile-mobile-sidebar fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[360px] flex-col bg-black transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#E10600]">Mordisco</p>
            <p className="text-xl font-black uppercase leading-none tracking-[-0.05em]">Social Club</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition duration-200 active:scale-95"
            aria-label="Cerrar navegacion"
          >
            <X size={19} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-[28px] border border-[#E10600] bg-[#E10600] p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black text-2xl font-black uppercase">
                {profile.avatarUrl ? (
                  <Image src={profile.avatarUrl} alt={profile.name || "Miembro"} width={56} height={56} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  (profile.name || "M").slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-black uppercase leading-none tracking-[-0.04em]">{profile.name || "Miembro Mordisco"}</p>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{membership.current.name}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-black px-3 py-3">
                <p className="text-lg font-black leading-none">{profile.points.toLocaleString("es-AR")}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/50">Puntos</p>
              </div>
              <div className="rounded-2xl bg-black px-3 py-3">
                <p className="text-lg font-black leading-none">{membership.progress}%</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/50">Progreso</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 pb-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            const isGold = item.tone === "gold";
            return (
              <button
                key={item.id}
                onClick={() => selectSection(item.id)}
                className={[
                  "group relative flex w-full items-center gap-3 rounded-[26px] border px-4 py-4 text-left transition duration-200 active:scale-[0.99]",
                  active
                    ? isGold
                      ? "border-[#D6A100] bg-[#D6A100] text-black"
                      : "border-[#E10600] bg-white text-black"
                    : "border-white/10 bg-white/[0.04] text-white hover:border-[#E10600] hover:bg-white/[0.08]",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                    active ? "bg-black text-white" : isGold ? "bg-[#D6A100] text-black" : "bg-[#E10600] text-white",
                  ].join(" ")}
                >
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={["block text-[9px] font-black uppercase tracking-[0.2em]", active ? "text-black/55" : "text-white/40"].join(" ")}>{item.kicker}</span>
                  <span className="mt-0.5 block text-lg font-black uppercase leading-none tracking-[-0.04em]">{item.label}</span>
                  <span className={["mt-1 block truncate text-xs font-bold uppercase", active ? "text-black/60" : "text-white/45"].join(" ")}>{item.description}</span>
                </span>
                {item.id === "datos" && profileIsIncomplete && <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-[#E10600]" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = `/${branchSlug}`;
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-3 text-xs font-black uppercase text-white transition duration-200 hover:border-[#E10600] hover:bg-[#E10600]"
          >
            <LogOut size={16} />
            Salir
          </button>
        </div>
      </aside>
    </>
  );
}

function ClubSection({
  profile,
  membership,
  uploadingAvatar,
  onAvatarClick,
  redeemingRewardId,
  onRedeemReward,
  branchSlug,
}: {
  profile: UserProfile;
  membership: ReturnType<typeof getMembershipStatus>;
  uploadingAvatar: boolean;
  onAvatarClick: () => void;
  redeemingRewardId: string | null;
  onRedeemReward: (rewardId: string) => void;
  branchSlug: string;
}) {
  const nextStatus = membership.next?.name || "MAX STATUS";
  const router = useRouter();
  const requiredOrders = membership.next?.minOrders || profile.totalOrders;
  const memberSince = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("es-AR", { month: "short", year: "numeric" }) : "Mordisco";
  const memberId = (profile.id || profile.phone || "mordisco").replace(/\D/g, "").slice(-6).padStart(6, "0");

  return (
    <div className="space-y-5">
      <section className="min-h-[calc(100dvh-96px)] rounded-[34px] bg-black p-5 text-white sm:p-8 lg:p-10">
        <div className="flex min-h-[calc(100dvh-136px)] flex-col justify-between gap-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/55">Mordisco Social Club</p>
              <h1 className="mt-4 break-words text-[56px] font-black uppercase leading-[0.82] tracking-[-0.07em] text-white sm:text-[96px] lg:text-[118px]">
                {membership.current.name}
              </h1>
            </div>
            <div className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">
              #{memberId}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.78fr] lg:items-end">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Puntos disponibles</p>
              <div className="mt-2 flex items-end gap-3">
                <p className="text-[76px] font-black leading-[0.82] tracking-[-0.08em] text-[#E10600] sm:text-[118px]">
                  {profile.points.toLocaleString("es-AR")}
                </p>
                <p className="pb-2 text-2xl font-black uppercase tracking-[-0.05em] text-white sm:text-4xl">PTS</p>
              </div>
              <p className="mt-4 text-sm font-bold uppercase leading-6 text-white/70">Disponibles para canjear por premios y beneficios del club.</p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">Proximo nivel</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-black uppercase leading-none tracking-[-0.05em] text-white">{nextStatus}</p>
                  <p className="mt-2 text-xs font-black uppercase leading-5 text-white/60">
                    {membership.next ? `${profile.totalOrders} / ${requiredOrders} pedidos` : "Rango maximo desbloqueado"}
                  </p>
                </div>
                <p className="text-4xl font-black tracking-[-0.06em] text-[#E10600]">{membership.progress}%</p>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[#E10600]" style={{ width: `${membership.progress}%` }} />
              </div>
              <p className="mt-4 text-sm font-black uppercase leading-6 text-white">
                {membership.next ? `Te faltan ${membership.missingOrders} pedidos para llegar a ${membership.next.name}.` : "Ya estas en el maximo estatus del club."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
        <MemberCard profile={profile} membership={membership} uploadingAvatar={uploadingAvatar} onAvatarClick={onAvatarClick} memberSince={memberSince} memberId={memberId} />

        <div className="rounded-[30px] bg-black p-5 text-white sm:rounded-[32px] sm:p-7">
          <SectionHeader kicker="" title="Ruta Mordisco" />
          <div className="mt-6 grid gap-3">
            {SOCIAL_STATUSES.map((status, index) => (
              <PremiumStatusStep
                key={status.name}
                name={status.name}
                minOrders={status.minOrders}
                completed={index < membership.currentIndex}
                active={index === membership.currentIndex}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 text-white">
        <BenefitCard icon={ShoppingBag} title="Cada pedido suma" text="Volver a comprar te acerca al proximo nivel." />
        <BenefitCard icon={Gift} title="Canjea recompensas" text="Tus puntos tienen valor real dentro del club." />
        <BenefitCard icon={Crown} title="Beneficios exclusivos" text="Si sos nivel Black o Founder, tenés tu propio cupón de descuento 😏" />
      </section>

      <section className="rounded-[30px] bg-black p-5 text-white sm:rounded-[32px] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionHeader kicker="Premios" title="Recompensas" />
            <p className="mt-2 text-sm font-bold uppercase text-white/65">Premios para convertir puntos en experiencia.</p>
          </div>
          {profile.rewardCatalog.length > 0 && (
            <button
              onClick={() => router.push(`/${branchSlug}/account/rewards`)}
              className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-2 text-[10px] font-black uppercase text-black transition hover:bg-[#E10600] hover:text-white"
            >
              Ver todos <ArrowRight size={13} />
            </button>
          )}
        </div>

        {profile.availableRedemptions.length > 0 && (
          <div className="mt-6 rounded-3xl bg-black/20 p-4 text-white">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Canjes activos</p>
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

        <div className="mt-6">
            {profile.rewardCatalog.length === 0 && (
              <div className="rounded-3xl bg-white/10 p-5 text-sm font-bold uppercase leading-6 text-white/70">
                Todavia no hay recompensas disponibles.
              </div>
            )}
            {profile.rewardCatalog.length > 0 && (
              <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  text-white">
                {profile.rewardCatalog.slice(0, 8).map((reward, index) => (
                  <RewardCard
                    key={reward.id}
                    reward={reward}
                    redeeming={redeemingRewardId === reward.id}
                    onRedeem={() => onRedeemReward(reward.id)}
                    badge={getRewardBadge(reward, index)}
                    compact
                  />
                ))}
              </div>
            )}
        </div>
      </section>

      {/* <section className="rounded-[30px] bg-white p-5 text-white sm:rounded-[32px] sm:p-7">
        <SectionHeader kicker="Exclusive access" title="Beneficios por nivel" />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-white">
          <ExclusiveBenefit level="CREW" text="Acceso anticipado a premios seleccionados." unlocked={membership.currentIndex >= 1} />
          <ExclusiveBenefit level="SOCIAL CLUB" text="Beneficios especiales en fechas del club." unlocked={membership.currentIndex >= 2} />
          <ExclusiveBenefit level="BLACK" text="Experiencias privadas y recompensas premium." unlocked={membership.currentIndex >= 3} />
          <ExclusiveBenefit level="FOUNDER" text="Estatus maximo, acceso fundador y trato preferencial." unlocked={membership.currentIndex >= 4} />
        </div>
      </section> */}
    </div>
  );
}

function OrdersSection({ orders, branchSlug }: { orders: RecentOrder[]; branchSlug: string }) {
  const router = useRouter();
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleReorder = async (orderId: string) => {
    setReorderingId(orderId);
    setError("");
    try {
      const response = await fetch("/api/account/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos repetir el pedido");
      sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(data.cartItems || []));
      router.push(`/${branchSlug}/checkout`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No pudimos repetir el pedido");
    } finally {
      setReorderingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-[34px] bg-black text-white">
      <div className="border-b border-white/10 bg-[#E10600] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-white/60">Historial</p>
            <h2 className="mt-2 text-[44px] font-black uppercase leading-[0.86] tracking-[-0.07em] sm:text-7xl">Mis pedidos</h2>
          </div>
          <div className="rounded-full border border-white/20 bg-black px-4 py-2 text-xs font-black uppercase text-white">
            {orders.length} {orders.length === 1 ? "pedido" : "pedidos"}
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-3xl border border-[#E10600] bg-[#E10600]/20 px-4 py-3 text-sm font-black uppercase text-white sm:mx-7">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="p-5 sm:p-7">
          <EmptyState icon={Package} title="Todavia no hiciste pedidos" text="Cuando compres, vas a ver tu actividad aca." />
        </div>
      ) : (
        <div className="grid gap-3 p-4 sm:p-7">
          {orders.map((order) => (
            <article key={order.id} className="rounded-[30px] border border-white/10 bg-white/[0.06] p-4 text-white sm:p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/45">{formatDate(order.created_at)}</p>
                    <p className="mt-1 text-3xl font-black uppercase leading-none tracking-[-0.06em]">
                      #{(order.order_number || order.id.slice(-6)).replace(/^ORD-/i, "").toUpperCase()}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-full bg-[#E10600] px-3 py-1.5 text-[10px] font-black uppercase text-white">
                    {statusLabel(order.status)}
                  </div>
                </div>

                <div className="rounded-3xl bg-black p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Pedido</p>
                  <p className="mt-2 text-sm font-bold uppercase leading-6 text-white/80">
                    {order.items?.map((item) => `${item.quantity}x ${item.name}`).join(" + ") || "Pedido"}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Total</p>
                    <p className="text-4xl font-black tracking-[-0.06em] text-[#E10600]">{formatCurrency(order.total)}</p>
                    {typeof order.shipping_cost === "number" && order.shipping_cost > 0 && (
                      <p className="mt-1 text-[10px] font-bold uppercase text-white/45">Incluye envio {formatCurrency(order.shipping_cost)}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
                    <button
                      onClick={() => router.push(`/${branchSlug}/account/orders`)}
                      className="flex min-h-12 items-center justify-center gap-1 rounded-full border border-white/15 px-3 text-xs font-black uppercase text-white transition hover:bg-white hover:text-black"
                    >
                      Ver detalle <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={() => handleReorder(order.id)}
                      disabled={reorderingId === order.id}
                      className="flex min-h-12 items-center justify-center rounded-full bg-[#E10600] px-3 text-xs font-black uppercase text-white transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {reorderingId === order.id ? <Loader2 size={16} className="animate-spin" /> : "Repetir pedido"}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {orders.length >= 3 && (
            <button
              onClick={() => router.push(`/${branchSlug}/account/orders`)}
              className="mt-2 flex min-h-14 items-center justify-center gap-2 rounded-full border border-white/15 text-sm font-black uppercase text-white transition hover:bg-white hover:text-black"
            >
              Ver historial completo <ChevronRight size={16} />
            </button>
          )}
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
      <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-65 sm:text-xs sm:tracking-[0.32em]">{kicker}</p>
      <h2 className="mt-2 break-words text-[34px] font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-6xl sm:tracking-[-0.055em]">
        {title}
      </h2>
    </header>
  );
}

function MemberCard({
  profile,
  membership,
  uploadingAvatar,
  onAvatarClick,
  memberSince,
  memberId,
}: {
  profile: UserProfile;
  membership: ReturnType<typeof getMembershipStatus>;
  uploadingAvatar: boolean;
  onAvatarClick: () => void;
  memberSince: string;
  memberId: string;
}) {
  return (
    <aside className="relative overflow-hidden rounded-[32px] bg-black p-5 text-white sm:p-7">
      <div className="absolute right-[-22%] top-[-18%] h-56 w-56 rounded-full border border-white/10" />
      <div className="absolute bottom-[-24%] left-[-20%] h-56 w-56 rounded-full border border-[#E10600]/35" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">Member card</p>
          <p className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/70">#{memberId}</p>
        </div>

        <button
          onClick={onAvatarClick}
          className="relative mt-8 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#E10600] text-3xl font-black uppercase text-white"
        >
          {profile.avatarUrl ? (
            <Image src={profile.avatarUrl} alt={profile.name || "Cliente"} width={80} height={80} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            (profile.name || "M").slice(0, 1).toUpperCase()
          )}
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/85 py-1 text-[8px] font-black uppercase text-white">
            {uploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
          </span>
        </button>

        <p className="mt-6 break-words text-3xl font-black uppercase leading-[0.9] tracking-[-0.055em] text-white">{profile.name || "Miembro Mordisco"}</p>
        <p className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-black">{membership.current.name}</p>

        <div className="mt-10 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Member since</p>
            <p className="mt-1 text-sm font-black uppercase text-white">{memberSince}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Status</p>
            <p className="mt-1 text-sm font-black uppercase text-[#E10600]">{membership.current.name}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PremiumStatusStep({
  name,
  minOrders,
  completed,
  active,
}: {
  name: string;
  minOrders: number;
  completed: boolean;
  active: boolean;
}) {
  const state = active ? "actual" : completed ? "desbloqueado" : "bloqueado";
  return (
    <div className={[
      "rounded-3xl border p-4 transition",
      active ? "border-[#E10600] bg-[#E10600] text-white" : completed ? "border-black bg-black text-white" : "border-black/10 bg-white/10 text-white",
    ].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xl font-black uppercase leading-none tracking-[-0.04em]">{name}</p>
          <p className={["mt-2 text-[10px] font-black uppercase tracking-[0.18em]", active || completed ? "text-white/65" : "text-white/45"].join(" ")}>
            {minOrders} pedidos requeridos
          </p>
        </div>
        <span className={["rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em]", active || completed ? "bg-white text-black" : "bg-black/10 text-white/45"].join(" ")}>
          {state}
        </span>
      </div>
    </div>
  );
}

function BenefitCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="rounded-[28px] bg-black p-5 text-white">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E10600] text-white">
        <Icon size={22} />
      </div>
      <p className="mt-5 text-xl font-black uppercase leading-none tracking-[-0.04em]">{title}</p>
      <p className="mt-3 text-sm font-bold uppercase leading-6 text-white/55">{text}</p>
    </article>
  );
}

function ExclusiveBenefit({ level, text, unlocked }: { level: string; text: string; unlocked: boolean }) {
  return (
    <article className={["rounded-3xl border p-4", unlocked ? "border-black bg-black text-white" : "border-black/10 bg-black/[0.04] text-white"].join(" ")}>
      <p className={["text-[10px] font-black uppercase tracking-[0.2em]", unlocked ? "text-[#E10600]" : "text-white/40"].join(" ")}>
        {unlocked ? "Disponible" : "Bloqueado"}
      </p>
      <p className="mt-3 text-2xl font-black uppercase leading-none tracking-[-0.05em]">{level}</p>
      <p className={["mt-3 text-xs font-bold uppercase leading-5", unlocked ? "text-white/65" : "text-white/55"].join(" ")}>{text}</p>
    </article>
  );
}

function getRewardBadge(reward: LoyaltyReward, index: number) {
  if (index === 0) return "Popular";
  if (reward.pointsCost >= 1500) return "Exclusivo";
  if (index <= 2) return "Nuevo";
  return null;
}

function RewardCard({
  reward,
  redeeming,
  onRedeem,
  compact,
  badge,
}: {
  reward: LoyaltyReward;
  redeeming: boolean;
  onRedeem: () => void;
  compact?: boolean;
  badge?: string | null;
}) {
  return (
    <article className={[
      "overflow-hidden rounded-3xl bg-white/10 text-white",
      compact ? "w-[76vw] max-w-[280px] shrink-0 snap-start sm:w-[260px]" : "w-full",
    ].join(" ")}>
      {reward.imageUrl ? (
        <div className={compact ? "relative h-28 w-full" : "relative h-32 w-full"}>
          <Image src={reward.imageUrl} alt={reward.name} fill sizes={compact ? "280px" : "(max-width: 768px) 50vw, 320px"} className="object-cover" loading="lazy" />
        </div>
      ) : (
        <div className={compact ? "flex h-28 items-center justify-center bg-[#E10600] text-white" : "flex h-32 items-center justify-center bg-[#E10600] text-white"}>
          <Gift size={34} />
        </div>
      )}
      <div className="p-4">
        {badge && <p className="mb-3 inline-flex rounded-full bg-[#E10600] px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white">{badge}</p>}
        <div className="flex min-h-[84px] flex-col justify-between">
          <div>
            <p className="line-clamp-2 text-lg font-black uppercase leading-none tracking-[-0.04em] text-white">{reward.name}</p>
            {reward.description && <p className="mt-2 line-clamp-2 text-[11px] font-bold uppercase leading-4 text-white/55">{reward.description}</p>}
          </div>
          <p className="mt-3 text-sm font-black uppercase text-[#E10600]">{reward.pointsCost} pts</p>
        </div>
        <button
          onClick={onRedeem}
          disabled={!reward.canRedeem || redeeming}
          className="mt-4 flex w-full items-center justify-center rounded-full bg-black py-3 text-xs font-black uppercase text-white transition duration-200 hover:bg-[#E10600] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
        >
          {redeeming ? "Canjeando..." : reward.canRedeem ? "Canjear" : "Faltan puntos"}
        </button>
      </div>
    </article>
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
