"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  User, Phone, Mail, Calendar, Package, Star, Award,
  TrendingUp, ShoppingBag, Heart, Gift, LogOut, ChevronRight,
  Clock, MapPin, CreditCard, Ticket,
} from "lucide-react";

type UserProfile = {
  name: string;
  phone: string;
  email: string;
  totalOrders: number;
  totalSpent: number;
  points: number;
  level: string;
  nextLevel: string;
  pointsToNextLevel: number;
  progress: number;
  stats: {
    burgers: number;
    pizzas: number;
    drinks: number;
  };
  recentOrders: any[];
  rewards: any[];
  availableCoupons: any[];
  favoriteProducts: any[];
};

export default function ProfilePage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"profile" | "orders" | "rewards" | "favorites">("profile");

  const tabs = [
    { id: "profile", label: "Perfil", icon: User },
    { id: "orders", label: "Pedidos", icon: Package },
    { id: "rewards", label: "Recompensas", icon: Gift },
    { id: "favorites", label: "Favoritos", icon: Heart },
  ] as const;

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${window.location.pathname.split("/")[1]}/auth/login`);
    }
  }, [session, authLoading]);

  useEffect(() => {
    if (session) {
      fetch("/api/account/profile")
        .then((r) => r.json())
        .then((data) => {
          const c = data.customer;
          const s = data.stats;
          setProfile({
            name: c.name || "Sin nombre",
            phone: c.phone || session.phone,
            email: c.email || "",
            totalOrders: s.totalOrders,
            totalSpent: s.totalSpent,
            points: s.points,
            level: s.level,
            nextLevel: s.nextLevel,
            pointsToNextLevel: s.points >= 1000 ? 0 : 1000 - s.points,
            progress: s.progress,
            stats: s.products,
            recentOrders: data.orders || [],
            rewards: data.rewards || [],
            availableCoupons: data.availableRedemptions?.map((r: any) => ({
              id: r.id,
              code: "RECOMPENSA",
              discount: r.type === "free_product" ? "Producto gratis" : `$${r.value}`,
              expires: r.expires_at ? new Date(r.expires_at).toLocaleDateString("es-AR") : "—",
            })) || [],
            favoriteProducts: data.favorites || [],
          });
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [session]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Cargando...</div>
      </div>
    );
  }

  if (!session || !profile) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-600 to-orange-800 text-white px-6 pt-12 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => router.back()} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition">
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <button onClick={logout} className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition">
              <LogOut size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold">
              {profile.name[0]}
            </div>
            <div>
              <h1 className="text-xl font-bold">{profile.name}</h1>
              <p className="text-orange-200 text-sm">{profile.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <div className="max-w-2xl mx-auto px-4 -mt-16">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-orange-100">
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{profile.totalOrders}</p>
              <p className="text-xs text-gray-500">Pedidos</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">${(profile.totalSpent / 1000).toFixed(1)}k</p>
              <p className="text-xs text-gray-500">Gastado</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{profile.points}</p>
              <p className="text-xs text-gray-500">Puntos</p>
            </div>
          </div>

          {/* Nivel */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-700">{profile.level}</span>
              <span className="text-xs text-gray-500">{profile.pointsToNextLevel} pts para {profile.nextLevel}</span>
            </div>
            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-1000" style={{ width: `${profile.progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4 mt-6">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition ${
                activeTab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon size={16} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 mt-6 pb-24 space-y-4">
        {activeTab === "profile" && (
          <>
            {/* Stats detalladas */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-4">Tus números</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: "🍔", label: "Hamburguesas", value: profile.stats.burgers },
                  { icon: "🍕", label: "Pizzas", value: profile.stats.pizzas },
                  { icon: "🥤", label: "Bebidas", value: profile.stats.drinks },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <span className="text-2xl">{s.icon}</span>
                    <p className="text-lg font-bold text-gray-900 mt-1">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Datos personales */}
            <div className="bg-white rounded-2xl p-5 border border-gray-100">
              <h3 className="font-semibold text-gray-900 mb-4">Datos personales</h3>
              <div className="space-y-3">
                {[
                  { icon: User, label: "Nombre", value: profile.name },
                  { icon: Phone, label: "Teléfono", value: profile.phone },
                  { icon: Mail, label: "Email", value: profile.email || "—" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-3 text-sm">
                    <f.icon size={16} className="text-gray-400" />
                    <span className="text-gray-500 w-20">{f.label}</span>
                    <span className="text-gray-900 font-medium">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cupones */}
            {profile.availableCoupons.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-4">🎟️ Cupones disponibles</h3>
                {profile.availableCoupons.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                    <div>
                      <p className="font-bold text-gray-900">{c.code}</p>
                      <p className="text-sm text-gray-600">{c.discount}</p>
                      <p className="text-xs text-gray-400">Vence: {c.expires}</p>
                    </div>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Usar</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "orders" && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Tu historial de pedidos aparecerá aquí</p>
          </div>
        )}

        {activeTab === "rewards" && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 px-1">🎯 Tus recompensas</h3>
            {profile.rewards.map((r) => (
              <div key={r.id} className={`bg-white rounded-2xl p-5 border ${r.unlocked ? "border-green-200" : "border-gray-100"}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className={`font-semibold ${r.unlocked ? "text-green-700" : "text-gray-900"}`}>
                      {r.unlocked ? "✅ " : ""}{r.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.unlocked ? "¡Desbloqueada!" : `${r.progress}/${r.total} compras`}
                    </p>
                  </div>
                  {r.unlocked && (
                    <button className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">Canjear</button>
                  )}
                </div>
                {!r.unlocked && (
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(r.progress / r.total) * 100}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "favorites" && (
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 px-1">❤️ Tus favoritos</h3>
            {profile.favoriteProducts.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
                <span className="font-medium text-gray-900">{p.name}</span>
                <span className="text-orange-600 font-bold">${p.price.toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
