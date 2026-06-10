"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Phone, ArrowRight, Loader, CheckCircle, RefreshCw } from "lucide-react";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(["", "", "", ""]);
  const [branchSlug, setBranchSlug] = useState("");
  const [step, setStep] = useState<"form" | "code" | "success" | "error">("form");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || `/${branchSlug || "sucursal"}/account/profile`;
  const inputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    setBranchSlug(pathname.split("/")[1]);
  }, [pathname]);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const handlePhoneSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phone.replace(/\D/g, "").length < 8) { setError("Ingresa un número válido"); return; }
    setLoading(true); setError("");

    try {
      const res = await fetch("/api/auth/request-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), branchSlug, returnTo }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("code");
        setTimer(300);
        setTimeout(() => inputRefs[0].current?.focus(), 100);
      } else {
        setError(data.error || "Error al enviar");
      }
    } catch { setError("Error de conexión"); }
    setLoading(false);
  };

  const handleCodeChange = (idx: number, value: string) => {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[idx] = value;
    setCode(newCode);
    if (value && idx < 3) inputRefs[idx + 1].current?.focus();
    if (value && idx === 3) verifyCode(newCode.join(""));
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (text.length === 4) {
      setCode(text.split(""));
      verifyCode(text);
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) inputRefs[idx - 1].current?.focus();
  };

  const verifyCode = async (fullCode?: string) => {
    const codeToVerify = fullCode || code.join("");
    if (codeToVerify.length < 4) return;
    setVerifying(true); setError("");

    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), code: codeToVerify }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("success");
        setTimeout(() => { window.location.replace(data.returnTo || returnTo); }, 800);
      } else {
        setError(data.error || "Código inválido");
        setCode(["", "", "", ""]);
        inputRefs[0].current?.focus();
      }
    } catch { setError("Error de conexión"); }
    setVerifying(false);
  };

  const resendCode = async () => {
    if (timer > 0) return;
    setLoading(true);
    await fetch("/api/auth/request-login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.replace(/\D/g, ""), branchSlug, returnTo }),
    });
    setTimer(300);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* STEP 1: Phone form */}
        {step === "form" && (
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-orange-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone size={28} className="text-orange-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Ingresá</h1>
              <p className="text-gray-500 mt-1">Te enviaremos un código por WhatsApp</p>
            </div>
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tu número de WhatsApp</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">+54</span>
                  <input type="tel" placeholder="379 409 4455" value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-gray-300 rounded-xl pl-12 pr-4 py-3.5 text-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition outline-none" autoFocus />
                </div>
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? <Loader size={20} className="animate-spin" /> : <>Enviar código <ArrowRight size={18} /></>}
              </button>
            </form>
            <p className="text-xs text-gray-400 text-center mt-6">Al ingresar aceptás recibir mensajes de WhatsApp de Mordisco</p>
          </div>
        )}

        {/* STEP 2: Code input */}
        {step === "code" && (
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-orange-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone size={28} className="text-orange-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Código de acceso</h1>
              <p className="text-gray-500 mt-1">Enviamos un código de 4 dígitos a <strong className="text-gray-700">{phone}</strong></p>
            </div>

            <div className="flex justify-center gap-3 mb-6" onPaste={handleCodePaste}>
              {code.map((digit, idx) => (
                <input key={idx} ref={inputRefs[idx]}
                  type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={(e) => handleCodeChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`w-14 h-14 text-center text-2xl font-bold border-2 rounded-xl outline-none transition ${
                    digit ? "border-orange-500 bg-orange-50" : "border-gray-300 bg-white"
                  } focus:border-orange-500 focus:ring-2 focus:ring-orange-200`}
                  autoComplete="one-time-code" />
              ))}
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">{error}</div>}

            <div className="flex items-center justify-between text-sm">
              <button onClick={() => setStep("form")} className="text-gray-500 hover:text-gray-700 underline">Cambiar número</button>
              <button onClick={resendCode} disabled={timer > 0 || loading}
                className="flex items-center gap-1.5 text-orange-600 hover:text-orange-700 font-medium disabled:text-gray-400">
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {timer > 0 ? `Reenviar en ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}` : "Reenviar código"}
              </button>
            </div>

            {verifying && (
              <div className="absolute inset-0 bg-white/80 rounded-3xl flex items-center justify-center">
                <Loader size={32} className="animate-spin text-orange-600" />
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Success */}
        {step === "success" && (
          <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center border border-green-100 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Bienvenido!</h1>
            <p className="text-gray-500">Ingresando a tu cuenta...</p>
          </div>
        )}
      </div>
    </div>
  );
}
