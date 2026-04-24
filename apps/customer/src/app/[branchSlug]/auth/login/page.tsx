"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import NavbarDelivery from "@/app/components/NavbarDelivery";
import { Phone, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Branding } from "@/types/menu";

export default function LoginPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const resolvedParams = React.use(params);
  const { branchSlug } = resolvedParams;
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchSlug,
          phone,
          name: name || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al enviar WhatsApp");
      }

      setSuccess(true);
      // Redirigir a página de verificación o mostrar instrucciones
      setTimeout(() => {
        router.push(
          `/${branchSlug}/auth/verify?phone=${encodeURIComponent(phone)}`,
        );
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    // Solo números
    const numbers = value.replace(/\D/g, "");

    // Formato: 11 1234 5678
    if (numbers.length <= 2) {
      return numbers;
    } else if (numbers.length <= 6) {
      return `${numbers.slice(0, 2)} ${numbers.slice(2)}`;
    } else if (numbers.length <= 10) {
      return `${numbers.slice(0, 2)} ${numbers.slice(2, 6)} ${numbers.slice(6)}`;
    } else {
      return `${numbers.slice(0, 2)} ${numbers.slice(2, 6)} ${numbers.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  // Obtener branding desde localStorage o contexto (simplificado)
  // En un caso real, deberíamos obtenerlo del servidor o contexto
  const [branding] = useState<Branding | undefined>(undefined);

  return (
    <div className="min-h-screen bg-gray-50">
      <NavbarDelivery
        onCartClick={() => {}}
        totalItems={0}
        branding={branding}
        branchSlug={branchSlug}
      />

      <div className="max-w-md mx-auto px-4 py-8">
        {/* Botón volver */}
        <Link
          href={`/${branchSlug}/order`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver al menú
        </Link>

        {/* Card de login */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Ingresar con WhatsApp
            </h1>
            <p className="text-gray-600">
              Te enviaremos un enlace seguro por WhatsApp para acceder a tu
              cuenta
            </p>
          </div>

          {success ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  ></path>
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                ¡WhatsApp enviado!
              </h2>
              <p className="text-gray-600 mb-6">
                Revisa tu WhatsApp para completar el acceso. Te redirigiremos en
                un momento...
              </p>
              <div className="text-sm text-gray-500">
                Si no recibes el mensaje, verifica que el número{" "}
                <strong>{phone}</strong> sea correcto.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de teléfono
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">+54</span>
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="11 1234 5678"
                    className="pl-14 w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    required
                    disabled={loading}
                    maxLength={13} // 2 + espacio + 4 + espacio + 4 = 12 caracteres
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Ejemplo: 11 1234 5678 (sin 0 ni 15)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tu nombre (opcional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Juan Pérez"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Nos ayudará a personalizar tu experiencia
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  backgroundColor: branding?.primary_color,
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando WhatsApp...
                  </>
                ) : (
                  <>
                    <Phone className="w-5 h-5" />
                    Enviar enlace por WhatsApp
                  </>
                )}
              </button>

              <div className="text-center text-sm text-gray-500 pt-4 border-t">
                <p>
                  Al continuar, aceptas nuestros{" "}
                  <a href="#" className="text-blue-600 hover:underline">
                    Términos de servicio
                  </a>{" "}
                  y{" "}
                  <a href="#" className="text-blue-600 hover:underline">
                    Política de privacidad
                  </a>
                </p>
              </div>
            </form>
          )}

          {/* Modo desarrollo: mostrar enlace directo */}
          {process.env.NODE_ENV === "development" && !success && (
            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium mb-2">
                🔧 Modo desarrollo
              </p>
              <p className="text-xs text-yellow-700">
                En desarrollo, el enlace de verificación aparecerá en la
                respuesta de la API.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
