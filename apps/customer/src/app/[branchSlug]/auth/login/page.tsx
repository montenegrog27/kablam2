"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, ArrowRight, Loader, CheckCircle } from "lucide-react";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [branchSlug, setBranchSlug] = useState("");
  const [step, setStep] = useState<"form" | "sent" | "error">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    setBranchSlug(window.location.pathname.split("/")[1]);
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Ingresá un número válido");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), branchSlug }),
      });

      const data = await res.json();
      if (data.success) {
        setStep("sent");
      } else {
        setError(data.error || "Error al enviar");
      }
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {step === "sent" ? (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center border border-orange-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">✅ Mensaje enviado</h1>
            <p className="text-gray-600 mb-6">
              Te enviamos un mensaje por WhatsApp a <strong>{phone}</strong>.
              Tocá el botón <strong>"Ingresar"</strong> para entrar automáticamente.
            </p>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-700 mb-6">
              ⏳ El link expira en 5 minutos
            </div>
            <button
              onClick={() => setStep("form")}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Quiero usar otro número
            </button>
          </div>
        ) : (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-orange-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone size={28} className="text-orange-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Ingresá</h1>
              <p className="text-gray-500 mt-1">
                Te enviaremos un link mágico por WhatsApp
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tu número de WhatsApp
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                    +54
                  </span>
                  <input
                    type="tel"
                    placeholder="379 409 4455"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-gray-300 rounded-xl pl-12 pr-4 py-3.5 text-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader size={20} className="animate-spin" />
                ) : (
                  <>
                    Enviar link <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-6">
              Al ingresar aceptás recibir mensajes de WhatsApp de Mordisco
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
