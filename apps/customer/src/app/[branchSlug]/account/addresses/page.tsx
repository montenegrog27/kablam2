"use client";

import { useState, useEffect } from "react";
import {
  MapPin,
  Plus,
  Edit,
  Trash2,
  Check,
  Home,
  Briefcase,
  Loader2,
  Navigation,
} from "lucide-react";

interface Address {
  id: string;
  alias: string;
  address: string;
  apartment?: string;
  floor?: string;
  notes?: string;
  is_default: boolean;
  latitude?: number;
  longitude?: number;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    alias: "",
    address: "",
    apartment: "",
    floor: "",
    notes: "",
    is_default: false,
  });

  // Cargar direcciones
  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/account/addresses");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al cargar direcciones");
      }

      setAddresses(data.addresses || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const url = editingId
        ? `/api/account/addresses/${editingId}`
        : "/api/account/addresses";

      const method = editingId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al guardar dirección");
      }

      setSuccess(editingId ? "Dirección actualizada" : "Dirección agregada");
      setShowForm(false);
      setEditingId(null);
      resetForm();

      // Recargar lista
      await loadAddresses();

      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (address: Address) => {
    setEditingId(address.id);
    setFormData({
      alias: address.alias,
      address: address.address,
      apartment: address.apartment || "",
      floor: address.floor || "",
      notes: address.notes || "",
      is_default: address.is_default,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar esta dirección?")) return;

    try {
      const response = await fetch(`/api/account/addresses/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Error al eliminar dirección");
      }

      setSuccess("Dirección eliminada");
      await loadAddresses();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Error desconocido");
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/account/addresses/${id}/default`, {
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error("Error al establecer dirección predeterminada");
      }

      setSuccess("Dirección predeterminada actualizada");
      await loadAddresses();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Error desconocido");
    }
  };

  const resetForm = () => {
    setFormData({
      alias: "",
      address: "",
      apartment: "",
      floor: "",
      notes: "",
      is_default: false,
    });
    setEditingId(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const getAliasIcon = (alias: string) => {
    switch (alias.toLowerCase()) {
      case "casa":
      case "hogar":
      case "home":
        return Home;
      case "trabajo":
      case "oficina":
      case "work":
        return Briefcase;
      default:
        return MapPin;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis direcciones</h1>
          <p className="text-gray-600 mt-1">
            Gestiona tus direcciones de entrega favoritas
          </p>
        </div>

        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={18} />
            Agregar dirección
          </button>
        )}
      </div>

      {/* Mensajes de estado */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Formulario (condicional) */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? "Editar dirección" : "Nueva dirección"}
            </h2>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                resetForm();
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Alias */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre (alias)
              </label>
              <input
                type="text"
                name="alias"
                value={formData.alias}
                onChange={handleChange}
                placeholder="Ej: Casa, Trabajo, Depto"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                required
              />
              <p className="text-xs text-gray-500 mt-2">
                Un nombre para identificar fácilmente esta dirección
              </p>
            </div>

            {/* Dirección completa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dirección completa
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Calle, número, barrio, ciudad"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                required
              />
            </div>

            {/* Apartamento y piso */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Piso (opcional)
                </label>
                <input
                  type="text"
                  name="floor"
                  value={formData.floor}
                  onChange={handleChange}
                  placeholder="Ej: 4"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Departamento (opcional)
                </label>
                <input
                  type="text"
                  name="apartment"
                  value={formData.apartment}
                  onChange={handleChange}
                  placeholder="Ej: A, 4B"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>
            </div>

            {/* Notas adicionales */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notas adicionales (opcional)
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Ej: Timbre roto, dejar con portero, etc."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
              />
            </div>

            {/* Predeterminada */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_default"
                name="is_default"
                checked={formData.is_default}
                onChange={handleChange}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor="is_default"
                className="ml-2 text-sm text-gray-700"
              >
                Establecer como dirección predeterminada
              </label>
            </div>

            {/* Botones del formulario */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    {editingId ? "Actualizar" : "Agregar"}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  resetForm();
                }}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de direcciones */}
      <div className="space-y-4">
        {addresses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No hay direcciones guardadas
            </h3>
            <p className="text-gray-600 mb-6">
              Agrega direcciones para agilizar tus pedidos a domicilio.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={18} />
              Agregar mi primera dirección
            </button>
          </div>
        ) : (
          addresses.map((address) => {
            const AliasIcon = getAliasIcon(address.alias);

            return (
              <div
                key={address.id}
                className={`bg-white rounded-xl shadow-sm border p-6 ${
                  address.is_default ? "ring-2 ring-blue-500" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        address.is_default ? "bg-blue-100" : "bg-gray-100"
                      }`}
                    >
                      <AliasIcon
                        className={`w-6 h-6 ${
                          address.is_default ? "text-blue-600" : "text-gray-600"
                        }`}
                      />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {address.alias}
                        </h3>
                        {address.is_default && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Check size={10} />
                            Predeterminada
                          </span>
                        )}
                      </div>

                      <p className="text-gray-700 mb-2">{address.address}</p>

                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        {address.floor && <span>Piso: {address.floor}</span>}
                        {address.apartment && (
                          <span>Depto: {address.apartment}</span>
                        )}
                      </div>

                      {address.notes && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Nota:</span>{" "}
                            {address.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2">
                    {!address.is_default && (
                      <button
                        onClick={() => handleSetDefault(address.id)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Establecer como predeterminada"
                      >
                        <Check size={18} />
                      </button>
                    )}

                    <button
                      onClick={() => handleEdit(address)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>

                    <button
                      onClick={() => handleDelete(address.id)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                {/* Botón usar en pedido */}
                <div className="mt-6 pt-6 border-t">
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium">
                    <Navigation size={14} />
                    Usar en mi próximo pedido
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Nota sobre geolocalización */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <MapPin className="w-6 h-6 text-blue-600 mt-1" />
          <div>
            <h4 className="font-medium text-blue-900 mb-2">
              ¿Por qué guardar direcciones?
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Agiliza el checkout de tus pedidos a domicilio</li>
              <li>• Evita errores al escribir la dirección cada vez</li>
              <li>• Podemos guardar tus preferencias de entrega</li>
              <li>• Acceso rápido desde cualquier dispositivo</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
