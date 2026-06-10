"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import ProdeProfile from "@/app/components/ProdeProfile";
import {
  Award,
  CheckCircle,
  Gift,
  Heart,
  Loader2,
  Mail,
  Package,
  Phone,
  Save,
  Star,
  User,
} from "lucide-react";

type UserProfile = {
  name: string;
  phone: string;
  email: string;
  birthDate: string;
  totalOrders: number;
  totalSpent: number;
  points: number;
  level: string;
  nextLevel: string;
  progress: number;
  recentOrders: Array<{
    id: string;
    status: string;
    total: number;
    created_at: string;
    items: Array<{ name: string; quantity: number }>;
  }>;
  favoriteProducts: Array<{ id: string; name: string; price: number }>;
};

type Preferences = {
  orderType: "delivery" | "takeaway";
  contactMethod: "whatsapp" | "phone";
  substitutions: "ask" | "remove" | "similar";
};

const defaultPreferences: Preferences = {
  orderType: "delivery",
  contactMethod: "whatsapp",
  substitutions: "ask",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function ProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const branchSlug = pathname.split("/").filter(Boolean)[0];
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ name: "", email: "", birthDate: "" });
  const [preferences, setPreferences] = useState<Preferences>(() => {
    if (typeof window === "undefined") return defaultPreferences;

    try {
      const slug = window.location.pathname.split("/").filter(Boolean)[0];
      const stored = localStorage.getItem(`customer_preferences_${slug}`);
      return stored
        ? { ...defaultPreferences, ...JSON.parse(stored) }
        : defaultPreferences;
    } catch {
      return defaultPreferences;
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authLoading && !session) {
      const returnTo = encodeURIComponent(pathname);
      router.push(`/${branchSlug}/auth/login?returnTo=${returnTo}`);
    }
  }, [authLoading, branchSlug, pathname, router, session]);

  useEffect(() => {
    if (!session) return;

    fetch("/api/account/profile", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const customer = data.customer;
        const stats = data.stats;
        const nextProfile: UserProfile = {
          name: customer.name || "",
          phone: customer.phone || session.phone,
          email: customer.email || "",
          birthDate: customer.birthDate || "",
          totalOrders: stats.totalOrders || 0,
          totalSpent: stats.totalSpent || 0,
          points: stats.points || 0,
          level: stats.level || "Novato",
          nextLevel: stats.nextLevel || "Aprendiz",
          progress: stats.progress || 0,
          recentOrders: data.orders || [],
          favoriteProducts: data.favorites || [],
        };

        setProfile(nextProfile);
        setForm({
          name: nextProfile.name,
          email: nextProfile.email,
          birthDate: nextProfile.birthDate,
        });
      })
      .finally(() => setLoading(false));
  }, [session]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (response.ok) {
      setProfile((current) =>
        current ? { ...current, ...form, birthDate: form.birthDate } : current,
      );
      setMessage("Perfil actualizado");
    } else {
      const data = await response.json();
      setMessage(data.error || "No pudimos guardar el perfil");
    }

    setSaving(false);
  };

  const savePreferences = (next: Preferences) => {
    setPreferences(next);
    localStorage.setItem(
      `customer_preferences_${branchSlug}`,
      JSON.stringify(next),
    );
    setMessage("Preferencias guardadas");
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
      </div>
    );
  }

  if (!session || !profile) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-orange-600 to-orange-800 p-6 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-2xl font-black">
              {(profile.name || "C")[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-black">
                {profile.name || "Completa tu perfil"}
              </h1>
              <p className="mt-1 text-sm text-orange-100">{profile.phone}</p>
            </div>
          </div>
          <div className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
            {profile.level}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Metric label="Pedidos" value={profile.totalOrders.toString()} />
          <Metric label="Gastado" value={formatCurrency(profile.totalSpent)} />
          <Metric label="Puntos" value={profile.points.toString()} />
        </div>
      </section>

      {message && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
          <CheckCircle size={18} />
          {message}
        </div>
      )}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
            <User size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Datos personales</h2>
            <p className="text-sm text-gray-500">
              Usamos estos datos para acelerar tu checkout.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" icon={User}>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Tu nombre"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-gray-900"
            />
          </Field>

          <Field label="Telefono" icon={Phone}>
            <input
              value={profile.phone}
              disabled
              className="w-full rounded-xl border bg-gray-50 px-4 py-3 text-gray-500"
            />
          </Field>

          <Field label="Email" icon={Mail}>
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="tu@email.com"
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-gray-900"
            />
          </Field>

          <Field label="Cumpleaños" icon={Gift}>
            <input
              type="date"
              value={form.birthDate || ""}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  birthDate: event.target.value,
                }))
              }
              className="w-full rounded-xl border px-4 py-3 outline-none focus:border-gray-900"
            />
          </Field>
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          Guardar perfil
        </button>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
            <Star size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Preferencias</h2>
            <p className="text-sm text-gray-500">
              Ajustes basicos para tu proximo pedido.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <PreferenceGroup
            label="Pedido favorito"
            value={preferences.orderType}
            options={[
              { label: "Delivery", value: "delivery" },
              { label: "Retiro", value: "takeaway" },
            ]}
            onChange={(value) =>
              savePreferences({ ...preferences, orderType: value })
            }
          />
          <PreferenceGroup
            label="Contacto"
            value={preferences.contactMethod}
            options={[
              { label: "WhatsApp", value: "whatsapp" },
              { label: "Llamada", value: "phone" },
            ]}
            onChange={(value) =>
              savePreferences({ ...preferences, contactMethod: value })
            }
          />
          <PreferenceGroup
            label="Si falta algo"
            value={preferences.substitutions}
            options={[
              { label: "Preguntar", value: "ask" },
              { label: "Quitar", value: "remove" },
              { label: "Similar", value: "similar" },
            ]}
            onChange={(value) =>
              savePreferences({ ...preferences, substitutions: value })
            }
          />
        </div>
      </section>

      <ProdeProfile branchSlug={branchSlug} customerId={session?.customerId} tenantId={session?.tenantId} />

      <section className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          icon={Package}
          title="Ultimos pedidos"
          empty="Todavia no hay pedidos."
          items={profile.recentOrders.slice(0, 3).map((order) => ({
            id: order.id,
            title: `Pedido ${order.id.slice(-6).toUpperCase()}`,
            subtitle: `${order.status} - ${formatCurrency(order.total)}`,
          }))}
          action={() => router.push(`/${branchSlug}/account/orders`)}
          actionLabel="Ver historial"
        />
        <SummaryCard
          icon={Heart}
          title="Favoritos"
          empty="Tus favoritos apareceran aca."
          items={profile.favoriteProducts.slice(0, 3).map((favorite) => ({
            id: favorite.id,
            title: favorite.name,
            subtitle: formatCurrency(favorite.price),
          }))}
          action={() => router.push(`/${branchSlug}/order`)}
          actionLabel="Ver menu"
        />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/15 p-3">
      <p className="text-lg font-black">{value}</p>
      <p className="text-xs text-orange-100">{label}</p>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        <Icon size={15} />
        {label}
      </span>
      {children}
    </label>
  );
}

function PreferenceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <div className="grid gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
              value === option.value
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  empty,
  items,
  action,
  actionLabel,
}: {
  icon: typeof Award;
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; subtitle: string }>;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
            <Icon size={18} />
          </div>
          <h2 className="font-bold text-gray-900">{title}</h2>
        </div>
        <button onClick={action} className="text-sm font-bold text-orange-700">
          {actionLabel}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-gray-50 p-3">
              <p className="font-semibold text-gray-900">{item.title}</p>
              <p className="text-sm text-gray-500">{item.subtitle}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
