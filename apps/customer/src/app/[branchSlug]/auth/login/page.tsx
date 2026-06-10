"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Loader,
  MessageCircle,
  Phone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type LoginStep = "form" | "code" | "success";

type ApiResult = {
  success?: boolean;
  error?: string;
  message?: string;
  returnTo?: string;
};

async function readJsonResponse(response: Response): Promise<ApiResult> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as ApiResult;
  } catch {
    const looksLikeHtml = text.trim().startsWith("<");
    return {
      error: looksLikeHtml
        ? "El servidor devolvio una pagina inesperada. Actualiza e intenta otra vez."
        : "No pudimos leer la respuesta del servidor.",
    };
  }
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function displayPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState(["", "", "", ""]);
  const [branchSlug, setBranchSlug] = useState("");
  const [step, setStep] = useState<LoginStep>("form");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    setBranchSlug(pathname.split("/").filter(Boolean)[0] || "");
  }, [pathname]);

  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((value) => value - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const cleanPhone = normalizePhone(phone);
  const returnTo = searchParams.get("returnTo") || `/${branchSlug || "sucursal"}/account/profile`;
  const canSubmitPhone = cleanPhone.length >= 8 && !loading;
  const timerLabel = useMemo(() => {
    const minutes = Math.floor(timer / 60);
    const seconds = String(timer % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [timer]);

  const requestCode = async () => {
    const response = await fetch("/api/auth/request-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: cleanPhone, branchSlug, returnTo }),
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data.success) {
      throw new Error(data.error || "No pudimos enviar el codigo.");
    }
    return data;
  };

  const handlePhoneSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cleanPhone.length < 8) {
      setError("Ingresa un numero de WhatsApp valido.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await requestCode();
      setStep("code");
      setTimer(300);
      setTimeout(() => inputRefs[0].current?.focus(), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar el codigo.");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (fullCode?: string) => {
    const codeToVerify = fullCode || code.join("");
    if (codeToVerify.length < 4 || verifying) return;

    setVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, code: codeToVerify }),
      });
      const data = await readJsonResponse(response);

      if (response.ok && data.success) {
        setStep("success");
        setTimeout(() => window.location.replace(data.returnTo || returnTo), 650);
        return;
      }

      setError(data.error || "Codigo invalido o vencido.");
      setCode(["", "", "", ""]);
      setTimeout(() => inputRefs[0].current?.focus(), 80);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexion.");
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeChange = (idx: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(0, 1);
    const nextCode = [...code];
    nextCode[idx] = digit;
    setCode(nextCode);

    if (digit && idx < 3) inputRefs[idx + 1].current?.focus();
    if (digit && idx === 3) verifyCode(nextCode.join(""));
  };

  const handleCodePaste = (event: React.ClipboardEvent) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length !== 4) return;
    event.preventDefault();
    setCode(pasted.split(""));
    verifyCode(pasted);
  };

  const handleKeyDown = (idx: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs[idx - 1].current?.focus();
    }
  };

  const resendCode = async () => {
    if (timer > 0 || loading) return;
    setLoading(true);
    setError("");

    try {
      await requestCode();
      setTimer(300);
      setCode(["", "", "", ""]);
      setTimeout(() => inputRefs[0].current?.focus(), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos reenviar el codigo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080605] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.22),transparent_34%),linear-gradient(180deg,#1b100b,#080605_58%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-8">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.07] shadow-2xl shadow-black/35 backdrop-blur-xl">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 text-white shadow-lg shadow-red-950/30">
                  <MessageCircle size={22} />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-red-100/60">Acceso seguro</p>
                  <h1 className="text-xl font-black tracking-tight">Entrar con WhatsApp</h1>
                </div>
              </div>
              <div className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-200 sm:block">
                Sin contrasena
              </div>
            </div>
          </div>

          {step === "form" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-5 p-6">
              <div>
                <h2 className="text-2xl font-black leading-tight">Te enviamos un codigo para ingresar</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Usamos tu WhatsApp para proteger tu cuenta, recuperar tus datos y completar tus pedidos mas rapido.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.18em] text-white/45">WhatsApp</label>
                <div className="flex items-center gap-3 rounded-2xl border border-white/12 bg-black/30 px-4 py-3 focus-within:border-red-300/50">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-black text-white/70">+54</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="379 409 4455"
                    value={displayPhone(phone)}
                    onChange={(event) => setPhone(normalizePhone(event.target.value))}
                    className="min-w-0 flex-1 bg-transparent text-lg font-bold text-white outline-none placeholder:text-white/20"
                    autoFocus
                  />
                  <Phone size={18} className="text-white/30" />
                </div>
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={!canSubmitPhone}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-red-950/35 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? <Loader size={18} className="animate-spin" /> : <>Enviar codigo <ArrowRight size={18} /></>}
              </button>

              <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-xs leading-5 text-white/55">
                <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-emerald-300" />
                Nunca te vamos a pedir claves. El codigo solo sirve una vez y vence en 5 minutos.
              </div>
            </form>
          )}

          {step === "code" && (
            <section className="relative space-y-5 p-6">
              <button onClick={() => setStep("form")} className="inline-flex items-center gap-2 text-sm font-bold text-white/55 transition hover:text-white">
                <ArrowLeft size={16} /> Cambiar numero
              </button>

              <div>
                <h2 className="text-2xl font-black leading-tight">Revisa tu WhatsApp</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  Enviamos un codigo de 4 digitos a <span className="font-bold text-white">+54 {displayPhone(phone)}</span>.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3" onPaste={handleCodePaste}>
                {code.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={inputRefs[idx]}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(event) => handleCodeChange(idx, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(idx, event)}
                    className="h-16 rounded-2xl border border-white/12 bg-black/35 text-center text-2xl font-black text-white outline-none transition focus:border-red-300 focus:bg-black/50"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              {error && <ErrorBox message={error} />}

              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-white/45">
                  {timer > 0 ? `Podes pedir otro codigo en ${timerLabel}` : "Ya podes pedir otro codigo."}
                </div>
                <button
                  onClick={resendCode}
                  disabled={timer > 0 || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-40"
                >
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  Reenviar codigo
                </button>
              </div>

              {verifying && (
                <div className="absolute inset-0 flex items-center justify-center rounded-[32px] bg-black/55 backdrop-blur-sm">
                  <Loader size={34} className="animate-spin text-red-300" />
                </div>
              )}
            </section>
          )}

          {step === "success" && (
            <section className="p-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/25">
                <CheckCircle size={38} />
              </div>
              <h2 className="text-2xl font-black">Listo, ya ingresaste</h2>
              <p className="mt-2 text-sm text-white/55">Estamos abriendo tu cuenta...</p>
            </section>
          )}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-white/35">
          Al ingresar aceptas recibir mensajes operativos de la tienda por WhatsApp.
        </p>
      </div>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-400/25 bg-red-500/12 px-4 py-3 text-sm font-semibold leading-5 text-red-100">
      {message}
    </div>
  );
}