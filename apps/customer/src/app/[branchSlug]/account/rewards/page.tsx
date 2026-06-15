"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Gift, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type LoyaltyReward = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  type: string;
  value?: number | null;
  imageUrl?: string | null;
  canRedeem: boolean;
};

export default function RewardsPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const branchSlug = pathname.split("/").filter(Boolean)[0];

  const [points, setPoints] = useState(0);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authLoading && !session) {
      router.push(`/${branchSlug}/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [authLoading, session, branchSlug, pathname, router]);

  useEffect(() => {
    if (!session) return;
    loadRewards();
  }, [session]);

  const loadRewards = async () => {
    setLoading(true);
    const response = await fetch("/api/account/profile", { cache: "no-store" });
    const data = await response.json();
    setPoints(data.stats?.points || 0);
    setRewards(data.rewardCatalog || []);
    setLoading(false);
  };

  const redeemReward = async (rewardId: string) => {
    setRedeemingRewardId(rewardId);
    setMessage("");

    const response = await fetch("/api/account/rewards/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rewardId }),
    });
    const data = await response.json();

    if (response.ok) {
      setMessage(data.code ? `Recompensa canjeada. Codigo: ${data.code}` : "Recompensa canjeada.");
      await loadRewards();
    } else {
      setMessage(data.error === "insufficient_points" ? "No tenes puntos suficientes para esta recompensa." : data.error || "No pudimos canjear la recompensa.");
    }

    setRedeemingRewardId(null);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E10600] text-white">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-[#E10600] px-4 pb-10 pt-4 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="sticky top-0 z-20 -mx-4 bg-[#E10600]/95 px-4 pb-4 pt-2">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => router.push(`/${branchSlug}/account/profile`)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black text-white"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/75">Tus puntos</p>
              <p className="text-2xl font-black uppercase tracking-[-0.04em]">{points} PTS</p>
            </div>
          </div>
          <h1 className="mt-7 text-[46px] font-black uppercase leading-[0.82] tracking-[-0.065em] text-white sm:text-7xl">
            Premios<br />Mordisco
          </h1>
          <p className="mt-4 max-w-lg text-sm font-bold uppercase leading-6 text-white/80">
            Canjea tus puntos por recompensas disponibles del club.
          </p>
        </header>

        {message && (
          <div className="mb-4 rounded-3xl bg-white px-4 py-3 text-center text-xs font-black uppercase text-black">
            {message}
          </div>
        )}

        {rewards.length === 0 ? (
          <section className="mt-6 rounded-[30px] bg-black p-6 text-center">
            <Gift size={34} className="mx-auto text-white/70" />
            <p className="mt-4 text-xl font-black uppercase tracking-[-0.04em]">Sin premios activos</p>
            <p className="mt-2 text-sm font-bold uppercase leading-6 text-white/60">Cuando haya recompensas disponibles, van a aparecer aca.</p>
          </section>
        ) : (
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rewards.map((reward) => (
              <article key={reward.id} className="overflow-hidden rounded-[24px] bg-black text-white">
                {reward.imageUrl ? (
                  <div className="relative h-28 w-full sm:h-36">
                    <Image src={reward.imageUrl} alt={reward.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="flex h-28 items-center justify-center bg-black text-white sm:h-36">
                    <Gift size={32} />
                  </div>
                )}
                <div className="p-3 sm:p-4">
                  <div className="min-h-[96px]">
                    <p className="line-clamp-2 text-base font-black uppercase leading-none tracking-[-0.04em] text-white sm:text-lg">{reward.name}</p>
                    {reward.description && <p className="mt-2 line-clamp-3 text-[10px] font-bold uppercase leading-4 text-white/55">{reward.description}</p>}
                    <p className="mt-3 text-sm font-black uppercase text-[#E10600]">{reward.pointsCost} pts</p>
                  </div>
                  <button
                    onClick={() => redeemReward(reward.id)}
                    disabled={!reward.canRedeem || redeemingRewardId === reward.id}
                    className="mt-4 flex w-full items-center justify-center rounded-full bg-black px-3 py-3 text-[11px] font-white uppercase text-white/55 transition hover:bg-[#E10600] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                  >
                    {redeemingRewardId === reward.id ? <Loader2 size={14} className="animate-spin" /> : reward.canRedeem ? "Canjear" : "Faltan pts"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
