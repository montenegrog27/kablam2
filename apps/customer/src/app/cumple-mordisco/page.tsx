"use client";
import { useState } from "react";

export default function CumpleMordiscoPage() {
  const [step, setStep] = useState<"form" | "success">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companions, setCompanions] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    setLoading(true);
    setError("");

    const branchSlug = window.location.pathname.split("/")[1] || "santafe1583";

    const res = await fetch("/api/event-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, companions, branchSlug }),
    });

    const data = await res.json();
    if (data.success) {
      setStep("success");
    } else {
      setError(data.error || "Error al registrar");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-500 via-purple-600 to-indigo-700 flex items-center justify-center p-4">
      {step === "form" ? (
        <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="text-5xl mb-2">🎂</div>
            <h1 className="text-3xl font-black text-gray-900">Cumple Mordisco</h1>
            <p className="text-sm text-gray-500">Registrate para la celebración</p>
          </div>

          {/* Count display */}
          <div className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-2xl p-4 text-center">
            <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider">Vos + acompañantes</p>
            <p className="text-5xl font-black text-purple-600 mt-1">{companions + 1}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Tu nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 text-base focus:border-purple-400 focus:ring-0 transition placeholder-gray-400"
                placeholder="Ej: Juan Pérez" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Teléfono</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 text-base focus:border-purple-400 focus:ring-0 transition placeholder-gray-400"
                placeholder="379412345678" required />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Acompañantes</label>
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <button type="button" onClick={() => setCompanions(Math.max(0, companions - 1))}
                  className="w-10 h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-purple-400 transition font-bold text-lg">−</button>
                <span className="flex-1 text-center text-2xl font-black text-gray-900">{companions}</span>
                <button type="button" onClick={() => setCompanions(Math.min(20, companions + 1))}
                  className="w-10 h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-purple-400 transition font-bold text-lg">+</button>
              </div>
            </div>

            {error && <p className="text-sm text-red-500 text-center">{error}</p>}

            <button type="submit" disabled={loading || !name || !phone}
              className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:from-pink-600 hover:to-purple-700 transition disabled:opacity-40 shadow-lg shadow-purple-200">
              {loading ? "Registrando..." : "🎉 Confirmar asistencia"}
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white/95 backdrop-blur rounded-3xl shadow-2xl max-w-md w-full p-8 text-center space-y-4">
          <div className="text-7xl mb-2">🎉</div>
          <h2 className="text-2xl font-black text-gray-900">¡Registrado!</h2>
          <p className="text-gray-500">Te esperamos en el Cumple Mordisco. Son {companions + 1} persona(s).</p>
          <div className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-2xl p-4">
            <p className="text-sm font-semibold text-purple-700">{name}</p>
            <p className="text-xs text-gray-500 mt-1">Presentá este nombre en la entrada</p>
          </div>
          <button onClick={() => { setStep("form"); setName(""); setPhone(""); setCompanions(0); }}
            className="text-sm text-purple-600 hover:text-purple-700 underline font-medium">
            Registrar otra persona
          </button>
        </div>
      )}
    </div>
  );
}
