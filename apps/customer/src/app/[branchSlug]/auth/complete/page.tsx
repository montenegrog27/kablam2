"use client";

import { use, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

export default function AuthCompletePage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branchSlug = use(params).branchSlug;
  const returnToParam = searchParams.get("returnTo");
  const returnTo =
    returnToParam?.startsWith(`/${branchSlug}/`) && !returnToParam.startsWith("//")
      ? returnToParam
      : `/${branchSlug}/account/profile`;

  useEffect(() => {
    const payload = JSON.stringify({
      returnTo,
      completedAt: Date.now(),
    });

    localStorage.setItem("kablam_auth_complete", payload);

    try {
      const channel = new BroadcastChannel("kablam_customer_auth");
      channel.postMessage({ type: "authenticated", returnTo });
      channel.close();
    } catch {
      // BroadcastChannel is not available in every webview.
    }

    const timeout = window.setTimeout(() => {
      router.replace(returnTo);
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [returnTo, router]);

  return (
    <main className="min-h-screen bg-orange-50 flex items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="text-green-600" size={34} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Ingreso listo</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Te estamos llevando de vuelta al pedido.
        </p>
        <Loader2 className="mx-auto mt-6 animate-spin text-orange-600" />
      </section>
    </main>
  );
}
