"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import NavbarDelivery from "@/app/components/NavbarDelivery";
import type { Branding } from "@/types/menu";

type VerificationStatus =
  | "pending"
  | "verifying"
  | "success"
  | "error"
  | "expired";

export default function VerifyPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const resolvedParams = React.use(params);
  const { branchSlug } = resolvedParams;
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token");
  const phoneParam = searchParams.get("phone");

  const [status, setStatus] = useState<VerificationStatus>("pending");
  const [message, setMessage] = useState("");
  const [phone] = useState(phoneParam || "");
  const [countdown, setCountdown] = useState(60); // 60 segundos para reintentar

  // Branding (simplificado)
  const [branding] = useState<Branding | undefined>(undefined);

  // Verificar automáticamente si hay token en la URL
  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contador para reintentar
  useEffect(() => {
    if (status === "error" && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, countdown]);

  const verifyToken = async (authToken: string) => {
    setStatus("verifying");
    setMessage("Verificando enlace...");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: authToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Token inválido");
      }

      setStatus("success");
      setMessage("¡Verificación exitosa! Redirigiendo...");

      // Redirigir a perfil después de 2 segundos
      setTimeout(() => {
        router.push(`/${branchSlug}/account/profile`);
      }, 2000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setMessage(message || "Error al verificar el enlace");
      if (message.includes("expirado")) {
        setStatus("expired");
      }
    }
  };

  const resendWhatsApp = async () => {
    if (!phone || countdown > 0) return;

    setStatus("pending");
    setMessage("Reenviando WhatsApp...");
    setCountdown(60);

    try {
      const response = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branchSlug,
          phone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al reenviar WhatsApp");
      }

      setMessage("¡WhatsApp reenviado! Revisa tu teléfono.");
      // No cambiar status para mantener UI de verificación
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setMessage(message || "Error al reenviar WhatsApp");
    }
  };

  const handleManualVerification = () => {
    if (token) {
      verifyToken(token);
    }
  };

  const renderStatusIcon = () => {
    switch (status) {
      case "verifying":
        return <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />;
      case "success":
        return <CheckCircle className="w-12 h-12 text-green-500" />;
      case "error":
      case "expired":
        return <XCircle className="w-12 h-12 text-red-500" />;
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-blue-200 animate-pulse" />
          </div>
        );
    }
  };

  const renderStatusMessage = () => {
    switch (status) {
      case "verifying":
        return (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Verificando enlace
            </h2>
            <p className="text-gray-600">Un momento, por favor...</p>
          </div>
        );

      case "success":
        return (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              ¡Verificación exitosa!
            </h2>
            <p className="text-gray-600">Serás redirigido a tu perfil...</p>
          </div>
        );

      case "error":
        return (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Error de verificación
            </h2>
            <p className="text-gray-600 mb-4">{message}</p>
            {phone && (
              <button
                onClick={resendWhatsApp}
                disabled={countdown > 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} />
                Reenviar WhatsApp {countdown > 0 ? `(${countdown}s)` : ""}
              </button>
            )}
          </div>
        );

      case "expired":
        return (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Enlace expirado
            </h2>
            <p className="text-gray-600 mb-4">
              El enlace de verificación ha expirado. Por favor, solicita uno
              nuevo.
            </p>
            <button
              onClick={() => router.push(`/${branchSlug}/auth/login`)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Volver a login
            </button>
          </div>
        );

      default:
        return (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Verificación requerida
            </h2>
            <p className="text-gray-600 mb-6">
              {token
                ? "Haz clic en el botón para verificar tu identidad."
                : "Revisa tu WhatsApp y haz clic en el enlace que te enviamos."}
            </p>

            {token ? (
              <button
                onClick={handleManualVerification}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Verificar ahora
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    📱 <strong>Paso 1:</strong> Revisa tu WhatsApp
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    Busca el mensaje de <strong>{branchSlug}</strong> con el
                    enlace de verificación.
                  </p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    🔗 <strong>Paso 2:</strong> Haz clic en el enlace
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    El enlace te llevará automáticamente a tu cuenta.
                  </p>
                </div>

                {phone && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-3">
                      ¿No recibiste el WhatsApp?
                    </p>
                    <button
                      onClick={resendWhatsApp}
                      disabled={countdown > 0}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={14} />
                      Reenviar {countdown > 0 ? `(${countdown}s)` : ""}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
    }
  };

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
          href={`/${branchSlug}/auth/login`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft size={16} />
          Volver al login
        </Link>

        {/* Card de verificación */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Icono de estado */}
          <div className="flex justify-center mb-6">{renderStatusIcon()}</div>

          {/* Mensaje de estado */}
          {renderStatusMessage()}

          {/* Mensaje adicional */}
          {message && status !== "error" && status !== "expired" && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">{message}</p>
            </div>
          )}

          {/* Información de depuración (solo desarrollo) */}
          {process.env.NODE_ENV === "development" && token && (
            <div className="mt-8 p-4 bg-gray-100 rounded-lg">
              <p className="text-xs text-gray-700 font-mono break-all">
                Token: {token}
              </p>
            </div>
          )}
        </div>

        {/* Ayuda */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            ¿Problemas con la verificación?{" "}
            <a
              href="#"
              className="text-blue-600 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                router.push(`/${branchSlug}/order`);
              }}
            >
              Volver al menú
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
