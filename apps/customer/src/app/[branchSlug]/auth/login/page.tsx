"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
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
import type { Branding } from "@/types/menu";

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
  const [branding, setBranding] = useState<Branding | null>(null);
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
    if (!branchSlug) return;

    let cancelled = false;
    async function loadBranding() {
      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .eq("slug", branchSlug)
        .maybeSingle();

      if (!branch?.id) return;

      const { data: settings } = await supabase
        .from("branch_settings")
        .select("logo_url, font_family, font_primary, font_url, meta_title")
        .eq("branch_id", branch.id)
        .maybeSingle();

      if (!cancelled) setBranding((settings || null) as Branding | null);
    }

    loadBranding().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [branchSlug]);

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
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-8">
        <div className="mb-7 flex justify-center">
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={branding.meta_title || "Logo"} className="max-h-20 max-w-[220px] object-contain" />
          ) : (
            <div className="border border-[#FF1A1A] px-5 py-4 text-center text-xl font-black uppercase tracking-[-0.03em]">
              Mordisco
            </div>
          )}
        </div>

        <section className="overflow-hidden border border-[#FF1A1A] bg-[#0A0A0A]">
          <div className="border-b border-[#FF1A1A] px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#A0A0A0]">Ingresar</p>
                <h1 className="mt-1 text-3xl font-black uppercase leading-none tracking-[-0.045em] text-white">
                  MORDISCO BURGER CLUB
                </h1>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#FF1A1A] bg-black text-[#FF1A1A]">
                <MessageCircle size={22} />
              </div>
            </div>
          </div>

          {step === "form" && (
            <form onSubmit={handlePhoneSubmit} className="space-y-5 p-6">
              <div>
                <h2 className="text-2xl font-black uppercase leading-tight tracking-[-0.035em]">Entrar con WhatsApp</h2>
  
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-[0.18em] text-[#A0A0A0]">WhatsApp</label>
                <div className="flex items-center gap-3 border border-[#FF1A1A] bg-black px-4 py-3 focus-within:border-[#FF3030]">
                  <span className="border border-[#FF1A1A] px-3 py-1 text-sm font-black text-white">+54</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="379 409 4455"
                    value={displayPhone(phone)}
                    onChange={(event) => setPhone(normalizePhone(event.target.value))}
                    className="min-w-0 flex-1 bg-transparent text-lg font-black text-white outline-none placeholder:text-[#A0A0A0]"
                    autoFocus
                  />
                  <Phone size={18} className="text-[#FF1A1A]" />
                </div>
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={!canSubmitPhone}
                className="flex w-full items-center justify-center gap-2 bg-[#FF1A1A] px-5 py-4 text-sm font-black uppercase text-white transition duration-200 hover:bg-[#FF3030] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? <Loader size={18} className="animate-spin" /> : <>Enviar codigo <ArrowRight size={18} /></>}
              </button>

 
            </form>
          )}

          {step === "code" && (
            <section className="relative space-y-5 p-6">
              <button onClick={() => setStep("form")} className="inline-flex items-center gap-2 text-sm font-black uppercase text-[#A0A0A0] transition hover:text-white">
                <ArrowLeft size={16} /> Cambiar numero
              </button>

              <div>
                <h2 className="text-2xl font-black uppercase leading-tight tracking-[-0.035em]">Revisa tu WhatsApp</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-[#A0A0A0]">
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
                    className="h-16 border border-[#FF1A1A] bg-black text-center text-2xl font-black text-white outline-none transition duration-200 focus:border-[#FF3030]"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              {error && <ErrorBox message={error} />}

              <div className="flex flex-col gap-3 border border-[#FF1A1A] bg-black p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-bold uppercase text-[#A0A0A0]">
                  {timer > 0 ? `Podes pedir otro codigo en ${timerLabel}` : "Ya podes pedir otro codigo."}
                </div>
                <button
                  onClick={resendCode}
                  disabled={timer > 0 || loading}
                  className="inline-flex items-center justify-center gap-2 border border-[#FF1A1A] px-4 py-2 text-sm font-black uppercase text-white transition duration-200 hover:bg-[#FF1A1A] disabled:opacity-40"
                >
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  Reenviar codigo
                </button>
              </div>

              {verifying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <Loader size={34} className="animate-spin text-[#FF1A1A]" />
                </div>
              )}
            </section>
          )}

          {step === "success" && (
            <section className="p-8 text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center border border-[#FF1A1A] bg-black text-[#FF1A1A]">
                <CheckCircle size={38} />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-[-0.035em]">Listo, ya ingresaste</h2>
              <p className="mt-2 text-sm text-[#A0A0A0]">Estamos abriendo tu cuenta...</p>
            </section>
          )}
        </section>

   
      </div>
    </main>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="border border-[#FF1A1A] bg-black px-4 py-3 text-sm font-bold uppercase leading-5 text-white">
      {message}
    </div>
  );
}
