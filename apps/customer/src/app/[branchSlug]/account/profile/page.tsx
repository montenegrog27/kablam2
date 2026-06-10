"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import ProdeProfile from "@/app/components/ProdeProfile";
import {
  User, Phone, Mail, Gift, Save, Loader2, Heart, Package,
  MapPin, ChevronRight, LogOut, ShoppingBag, Star, Trash2, AlertCircle,
} from "lucide-react";

type UserProfile = {
  id?: string;
  name: string; phone: string; email: string; birthDate: string;
  totalOrders: number; totalSpent: number; points: number;
  level: string; nextLevel: string; progress: number;
  recentOrders: Array<{ id: string; status: string; total: number; created_at: string; items: Array<{ name: string; quantity: number }> }>;
  favoriteProducts: Array<{ id: string; name: string; price: number }>;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(amount || 0);
}

export default function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter(); const pathname = usePathname();
  const branchSlug = pathname.split("/").filter(Boolean)[0];
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ name: "", email: "", birthDate: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${branchSlug}/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, session]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/account/profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const c = data.customer;
        const s = data.stats;
        const p: UserProfile = {
          id: c.id, name: c.name || "", phone: c.phone || session.phone,
          email: c.email || "", birthDate: c.birthDate || "",
          totalOrders: s.totalOrders || 0, totalSpent: s.totalSpent || 0,
          points: s.points || 0, level: s.level || "Novato",
          nextLevel: s.nextLevel || "Aprendiz", progress: s.progress || 0,
          recentOrders: data.orders || [], favoriteProducts: data.favorites || [],
        };
        setProfile(p);
        setForm({ name: p.name, email: p.email, birthDate: p.birthDate });
      })
      .finally(() => setLoading(false));
  }, [session]);

  const saveProfile = async () => {
    setSaving(true); setMessage("");
    const res = await fetch("/api/account/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) {
      setProfile((prev) => prev ? { ...prev, ...form, birthDate: form.birthDate } : prev);
      setMessage("Perfil actualizado");
    } else {
      const data = await res.json();
      setMessage(data.error || "Error al guardar");
    }
    setSaving(false);
  };

  const removeFavorite = async (productId: string) => {
    try {
      await fetch(`/api/account/favorites`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) });
      if (profile) setProfile({ ...profile, favoriteProducts: profile.favoriteProducts.filter((f) => f.id !== productId) });
    } catch {}
  };

  const incomplete = !profile?.name || !profile?.email;

  if (authLoading || loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><Loader2 className="animate-spin text-red-500" size={32} /></div>;
  if (!session || !profile) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 pb-8">
      {/* Header / Hero */}
      <div className="relative bg-gradient-to-b from-red-700 via-red-800 to-gray-950 px-5 pt-12 pb-8">
        {incomplete && (
          <div className="absolute top-4 left-4 right-4 bg-red-500/20 border border-red-500/30 backdrop-blur rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
            <span className="text-red-200">Te falta completar tus datos personales</span>
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-red-600/30 border border-red-500/40 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-red-900/30">
              {(profile.name || "C")[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{profile.name || "Sin nombre"}</h1>
              <p className="text-sm text-red-200/80">{profile.phone}</p>
              {incomplete && (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-red-300 bg-red-500/20 px-2 py-0.5 rounded-full">
                  <AlertCircle size={10} /> Perfil incompleto
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="bg-red-600/20 border border-red-500/30 rounded-xl px-3 py-1.5">
              <p className="text-xs text-red-300 uppercase tracking-wider">{profile.level}</p>
              <p className="text-lg font-black text-white">{profile.points} pts</p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { label: "Pedidos", value: profile.totalOrders.toString() },
            { label: "Gastado", value: formatCurrency(profile.totalSpent) },
            { label: "Nivel", value: profile.nextLevel },
          ].map((s) => (
            <div key={s.label} className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
              <p className="text-lg font-bold text-white">{s.value}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mt-3 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${Math.min(100, profile.progress)}%` }} />
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-5 -mt-4 grid grid-cols-2 gap-3">
        <ActionCard icon={ShoppingBag} label="Pedidos" href={`/${branchSlug}/account/orders`} />
        <ActionCard icon={MapPin} label="Direcciones" href={`/${branchSlug}/account/addresses`} />
      </div>

      {/* Message */}
      {message && (
        <div className="mx-5 mt-4 bg-emerald-900/30 border border-emerald-700/40 rounded-xl px-4 py-3 text-sm text-emerald-300 text-center font-medium">
          {message}
        </div>
      )}

      {/* Personal data */}
      <div className="mx-5 mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2"><User size={16} className="text-red-400" /> Datos personales</h2>
        <div className="space-y-3">
          <InputField label="Nombre" icon={User} value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Tu nombre" />
          <InputField label="Teléfono" icon={Phone} value={profile.phone} disabled />
          <InputField label="Email" icon={Mail} value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} placeholder="tu@email.com" type="email" />
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Gift size={12} /> Cumpleaños</p>
            <input type="date" value={form.birthDate || ""} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 focus:border-red-500/50 outline-none transition" />
          </div>
        </div>
        <button onClick={saveProfile} disabled={saving}
          className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-900/30">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar perfil
        </button>
      </div>

      {/* Favorites */}
      <div className="mx-5 mt-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2"><Heart size={16} className="text-red-400" /> Favoritos</h2>
          <button onClick={() => router.push(`/${branchSlug}/order`)} className="text-xs text-red-400 hover:text-red-300 font-medium">Ver menú</button>
        </div>
        {profile.favoriteProducts.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-3">Tocá el ♥ en un producto del menú para agregarlo</p>
        ) : (
          <div className="space-y-2">
            {profile.favoriteProducts.map((fav) => (
              <div key={fav.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
                <div className="flex items-center gap-3">
                  <Star size={14} className="text-red-400 fill-red-400" />
                  <span className="text-sm font-medium text-gray-100">{fav.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">{formatCurrency(fav.price)}</span>
                  <button onClick={() => removeFavorite(fav.id)} className="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent orders */}
      <div className="mx-5 mt-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2"><Package size={16} className="text-red-400" /> Últimos pedidos</h2>
          <button onClick={() => router.push(`/${branchSlug}/account/orders`)} className="text-xs text-red-400 hover:text-red-300 font-medium">Ver todos</button>
        </div>
        {profile.recentOrders.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-3">Sin pedidos aún</p>
        ) : profile.recentOrders.slice(0, 3).map((order) => (
          <div key={order.id} className="bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-100">#{order.id.slice(-6).toUpperCase()}</span>
              <span className="text-xs font-bold text-emerald-400">{formatCurrency(order.total)}</span>
            </div>
            <p className="text-[10px] text-gray-500 capitalize">{order.status} · {new Date(order.created_at).toLocaleDateString()}</p>
          </div>
        ))}
      </div>

      {/* Prode */}
      <div className="mx-5 mt-4">
        <ProdeProfile branchSlug={branchSlug} customerId={session?.customerId} tenantId={session?.tenantId} />
      </div>

      {/* Logout */}
      <div className="mx-5 mt-6">
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = `/${branchSlug}`;
          }}
          className="w-full py-3.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-red-400 hover:border-red-900/50 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function ActionCard({ icon: Icon, label, href }: { icon: any; label: string; href: string }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(href)}
      className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3.5 hover:bg-gray-800 transition group">
      <div className="w-9 h-9 rounded-lg bg-red-600/20 flex items-center justify-center"><Icon size={16} className="text-red-400" /></div>
      <div className="flex-1 text-left">
        <p className="text-sm font-semibold text-gray-100">{label}</p>
      </div>
      <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition" />
    </button>
  );
}

function InputField({ label, icon: Icon, value, onChange, placeholder, disabled, type }: { label: string; icon: any; value: string; onChange?: (v: string) => void; placeholder?: string; disabled?: boolean; type?: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5"><Icon size={12} /> {label}</p>
      {onChange ? (
        <input type={type || "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:border-red-500/50 outline-none transition disabled:opacity-50" disabled={disabled} />
      ) : (
        <input value={value} disabled
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-500 disabled:opacity-50" />
      )}
    </div>
  );
}
