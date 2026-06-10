"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, MapPin, Plus, Star, Trash2, Home, Building, Navigation } from "lucide-react";

type Address = {
  id: string;
  alias: string;
  address: string;
  apartment?: string;
  floor?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  is_default: boolean;
};

export default function AddressesPage() {
  const { session, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const branchSlug = pathname.split("/")[1];
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [apartment, setApartment] = useState("");
  const [floor, setFloor] = useState("");
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${branchSlug}/auth/login?returnTo=/${branchSlug}/account/addresses`);
      return;
    }
    if (session) loadAddresses();
  }, [session, authLoading]);

  // Google Maps autocomplete (only Corrientes Capital)
  useEffect(() => {
    if (!showForm || !addressInputRef.current || !(window as any).google) return;
    const corrientesBounds = new (window as any).google.maps.LatLngBounds(
      new (window as any).google.maps.LatLng(-27.55, -58.88),
      new (window as any).google.maps.LatLng(-27.42, -58.75),
    );
    const autocomplete = new (window as any).google.maps.places.Autocomplete(addressInputRef.current, {
      componentRestrictions: { country: "ar" },
      bounds: corrientesBounds,
      strictBounds: true,
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        setAddress(place.formatted_address || addressInputRef.current?.value || "");
        setLatitude(place.geometry.location.lat());
        setLongitude(place.geometry.location.lng());
      }
    });
  }, [showForm]);

  const loadAddresses = async () => {
    try {
      const res = await fetch("/api/account/addresses");
      const data = await res.json();
      setAddresses(data.addresses || []);
    } catch (e) {
      console.error("Error loading addresses:", e);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setAlias(""); setAddress(""); setApartment(""); setFloor(""); setNotes("");
    setLatitude(undefined); setLongitude(undefined); setIsDefault(false);
    setShowForm(false);
  };

  const saveAddress = async () => {
    if (!alias || !address) return;
    setSaving(true);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, address, apartment, floor, notes, latitude, longitude, is_default: isDefault }),
      });
      const data = await res.json();
      if (data.success) {
        resetForm();
        loadAddresses();
      } else {
        alert(data.error || "Error al guardar");
      }
    } catch { alert("Error de conexión"); }
    setSaving(false);
  };

  const deleteAddress = async (id: string) => {
    if (!confirm("¿Eliminar esta dirección?")) return;
    try {
      await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
      loadAddresses();
    } catch { alert("Error al eliminar"); }
  };

  const setAsDefault = async (id: string) => {
    try {
      await fetch(`/api/account/addresses/${id}/default`, { method: "POST" });
      loadAddresses();
    } catch { alert("Error al actualizar"); }
  };

  const navigateTo = (lat?: number, lng?: number) => {
    if (lat && lng) window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };

  if (authLoading || loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.push(`/${branchSlug}/account/profile`)} className="p-2 rounded-full hover:bg-gray-100 transition">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Mis direcciones</h1>
      </div>

      {/* List */}
      {addresses.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-white rounded-2xl border shadow-sm">
          <MapPin size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700">Sin direcciones guardadas</p>
          <p className="text-sm text-gray-500 mt-1 mb-4">Agregá una dirección para agilizar tus pedidos</p>
          <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition">
            <Plus size={16} className="inline mr-1" /> Agregar dirección
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((addr) => (
            <div key={addr.id} className="bg-white rounded-2xl border shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {addr.alias.toLowerCase().includes("casa") || addr.alias.toLowerCase().includes("hogar") ? <Home size={16} className="text-gray-600" /> : <Building size={16} className="text-gray-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{addr.alias}</p>
                      {addr.is_default && <Star size={14} className="text-amber-500 fill-amber-500" />}
                    </div>
                    <p className="text-sm text-gray-500">{addr.address}</p>
                    {(addr.apartment || addr.floor) && <p className="text-xs text-gray-400">{addr.floor && `Piso ${addr.floor}`}{addr.floor && addr.apartment && " · "}{addr.apartment && `Dto ${addr.apartment}`}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  {!addr.is_default && (
                    <button onClick={() => setAsDefault(addr.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-500" title="Predeterminada">
                      <Star size={15} />
                    </button>
                  )}
                  {(addr.latitude && addr.longitude) ? (
                    <button onClick={() => navigateTo(addr.latitude, addr.longitude)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Navegar">
                      <Navigation size={15} />
                    </button>
                  ) : null}
                  <button onClick={() => deleteAddress(addr.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add button (when list exists) */}
      {!showForm && addresses.length > 0 && (
        <button onClick={() => setShowForm(true)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-semibold text-gray-500 hover:border-gray-900 hover:text-gray-900 transition flex items-center justify-center gap-2 bg-white">
          <Plus size={18} /> Agregar dirección
        </button>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-gray-900">Nueva dirección</h3>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Identificación</label>
            <input value={alias} onChange={(e) => setAlias(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-gray-900 outline-none transition"
              placeholder="Ej: Casa, Trabajo, Casa de mamá..." />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Dirección *</label>
            <input ref={addressInputRef} value={address} onChange={(e) => setAddress(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-gray-900 outline-none transition"
              placeholder="Calle, número, ciudad..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Piso</label>
              <input value={floor} onChange={(e) => setFloor(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-gray-900 outline-none transition"
                placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Departamento</label>
              <input value={apartment} onChange={(e) => setApartment(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-gray-900 outline-none transition"
                placeholder="Opcional" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Notas (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:border-gray-900 outline-none transition"
              placeholder="Referencias, puntos de referencia..." />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
            <span className="text-sm text-gray-700">Establecer como dirección predeterminada</span>
          </label>

          <div className="flex gap-2">
            <button onClick={resetForm} className="flex-1 py-3 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition">Cancelar</button>
            <button onClick={saveAddress} disabled={!alias || !address || saving}
              className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition disabled:opacity-40">
              {saving ? "Guardando..." : "Guardar dirección"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
