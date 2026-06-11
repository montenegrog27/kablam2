"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Gift,
  Loader2,
  Medal,
  Share2,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  home_score?: number;
  away_score?: number;
  status: string;
  round: string;
};

type Prediction = {
  id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  first_scorer?: string;
  points_earned: number;
  bonus_points: number;
  status: string;
};

type Standing = {
  customer_id: string;
  customers?: { name?: string };
  total_points: number;
  correct_results: number;
  correct_scorers: number;
  correct_goals: number;
  perfect_predictions: number;
};

const GOLD = "#D6A100";
const ROUND_LABELS: Record<string, string> = {
  group: "Fase de grupos",
  round16: "Octavos",
  quarter: "Cuartos",
  semi: "Semifinal",
  final: "Final",
};
const ROUND_ORDER = ["group", "round16", "quarter", "semi", "final"];
const REWARDS = [
  { pos: "Top 10", desc: "Premios y beneficios exclusivos", icon: Gift },
  { pos: "Resultado exacto", desc: "Suma puntos extra", icon: Star },
  { pos: "Participar", desc: "Competis dentro del club", icon: Zap },
];

export default function ProdeProfile({ branchSlug, customerId, tenantId }: { branchSlug: string; customerId?: string; tenantId?: string }) {
  const [tab, setTab] = useState<"predictions" | "ranking">("predictions");
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [myPredictions, setMyPredictions] = useState<Record<string, { h: number | ""; a: number | ""; scorer: string; saved?: boolean }>>({});
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!customerId) return;
    load();
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [customerId, tenantId]);

  const load = async () => {
    if (!tenantId) return;
    const response = await fetch("/api/prode", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;
    setMatches(data.matches || []);
    setPredictions(data.predictions || []);
    setStandings(data.standings || []);
  };

  const getPrediction = (matchId: string) => predictions.find((p) => p.match_id === matchId);

  const submitPrediction = async (matchId: string) => {
    const pred = myPredictions[matchId];
    if (!pred || pred.h === "" || pred.a === "" || !customerId || !tenantId) return;
    setSavingMatchId(matchId);
    const response = await fetch("/api/prode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        homeScore: Number(pred.h),
        awayScore: Number(pred.a),
        firstScorer: pred.scorer || "",
      }),
    });
    if (response.ok) {
      setMyPredictions((prev) => ({ ...prev, [matchId]: { ...prev[matchId], saved: true } }));
      await load();
    }
    setSavingMatchId(null);
  };

  const predictMatch = (matchId: string, field: "h" | "a" | "scorer", value: string | number) => {
    setMyPredictions((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || { h: "", a: "", scorer: "" }),
        [field]: value,
        saved: false,
      },
    }));
  };

  const myStanding = standings.find((s) => s.customer_id === customerId);
  const myRank = standings.findIndex((s) => s.customer_id === customerId) + 1;
  const savedPredictions = predictions.length;
  const podium = standings.slice(0, 3);

  const matchesByRound = useMemo(() => {
    const grouped: Record<string, Match[]> = {};
    ROUND_ORDER.forEach((round) => (grouped[round] = []));
    matches.forEach((match) => {
      const key = ROUND_ORDER.includes(match.round) ? match.round : "group";
      grouped[key] ||= [];
      grouped[key].push(match);
    });
    return ROUND_ORDER.filter((round) => (grouped[round] || []).length > 0).map((round) => ({
      round,
      label: ROUND_LABELS[round],
      matches: grouped[round],
    }));
  }, [matches]);

  const isClosed = (match: Match) => new Date(match.match_date).getTime() <= Date.now();
  const canPredict = (match: Match) => match.status === "pending" && !isClosed(match);
  const formatDateShort = (date: string) => new Date(date).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const getPredictionForMatch = (match: Match) => {
    const saved = getPrediction(match.id);
    const local = myPredictions[match.id];
    return {
      h: local?.h ?? saved?.home_score ?? "",
      a: local?.a ?? saved?.away_score ?? "",
      scorer: local?.scorer ?? saved?.first_scorer ?? "",
      isSaved: Boolean(saved || local?.saved),
      points: saved?.points_earned || 0,
    };
  };

  const shareRanking = () => {
    const text = `Prode Mordisco\n\nEstoy #${myRank || "-"} con ${myStanding?.total_points || 0} puntos.\n\n${window.location.origin}/${branchSlug}/account/profile`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const toggleRound = (round: string) => setExpandedRounds((prev) => ({ ...prev, [round]: !prev[round] }));

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[32px] bg-black text-white">
        <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: GOLD }}>
                <Trophy size={22} className="text-black" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: GOLD }}>Mordisco Games</p>
                <h2 className="text-3xl font-black uppercase leading-none tracking-[-0.06em] sm:text-5xl">Prode Mordisco</h2>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Ranking" value={myRank > 0 ? `#${myRank}` : "-"} />
              <HeroMetric label="Puntos" value={String(myStanding?.total_points || 0)} />
              <HeroMetric label="Pronosticos" value={String(savedPredictions)} />
            </div>
          </div>

          <aside className="border-t border-white/10 bg-white p-5 text-black lg:border-l lg:border-t-0 sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black/45">Ranking destacado</p>
            {podium.length === 0 ? (
              <div className="mt-5 rounded-3xl bg-black p-5 text-white">
                <Medal size={28} style={{ color: GOLD }} />
                <p className="mt-3 text-lg font-black uppercase">Todavia sin ranking</p>
                <p className="mt-1 text-sm font-bold text-white/55">Hace tu primer pronostico y aparece aca.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {podium.map((standing, index) => (
                  <RankingRow key={standing.customer_id} standing={standing} rank={index + 1} isMe={standing.customer_id === customerId} compact />
                ))}
              </div>
            )}
            <button onClick={shareRanking} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-black py-3 text-xs font-black uppercase text-white transition hover:opacity-85">
              <Share2 size={15} /> Compartir posicion
            </button>
          </aside>
        </div>
      </div>

      {myStanding && (
        <div className="rounded-[28px] border border-black/10 bg-[#FFF7D8] p-4 text-black">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-black/45">Tu posicion actual</p>
              <p className="mt-1 text-3xl font-black uppercase tracking-[-0.05em]">#{myRank} / {myStanding.total_points} pts</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <SmallStat label="Exactos" value={myStanding.correct_results} />
              <SmallStat label="Goleadores" value={myStanding.correct_scorers} />
              <SmallStat label="Perfectos" value={myStanding.perfect_predictions} />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-full bg-black p-1">
        <button onClick={() => setTab("predictions")} className={`rounded-full py-3 text-xs font-black uppercase transition ${tab === "predictions" ? "bg-white text-black" : "text-white/65 hover:text-white"}`}>
          Mis pronosticos
        </button>
        <button onClick={() => setTab("ranking")} className={`rounded-full py-3 text-xs font-black uppercase transition ${tab === "ranking" ? "text-black" : "text-white/65 hover:text-white"}`} style={tab === "ranking" ? { backgroundColor: GOLD } : undefined}>
          Ranking
        </button>
      </div>

      {tab === "predictions" && (
        <div className="space-y-4">
          {matches.length === 0 ? (
            <EmptyProde icon={Target} title="Sin partidos disponibles" text="Cuando haya un partido activo, vas a poder cargar tu pronostico aca." />
          ) : (
            <>
              {matchesByRound.map(({ round, label, matches: roundMatches }) => {
                const isOpen = expandedRounds[round] !== false;
                const savedCount = roundMatches.filter((match) => getPrediction(match.id)).length;
                return (
                  <div key={round} className="overflow-hidden rounded-[28px] bg-white text-black">
                    <button onClick={() => toggleRound(round)} className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-black/[0.04]">
                      <div>
                        <p className="text-lg font-black uppercase tracking-[-0.04em]">{label}</p>
                        <p className="text-xs font-bold uppercase text-black/45">{savedCount}/{roundMatches.length} cargados</p>
                      </div>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t border-black/10 p-3">
                        {roundMatches.map((match) => (
                          <MatchPredictionCard
                            key={match.id}
                            match={match}
                            prediction={getPredictionForMatch(match)}
                            canPredict={canPredict(match)}
                            saving={savingMatchId === match.id}
                            onChange={predictMatch}
                            onSave={submitPrediction}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="rounded-[28px] bg-black p-5 text-white">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em]" style={{ color: GOLD }}><Gift size={15} /> Beneficios</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {REWARDS.map((reward) => (
                    <div key={reward.pos} className="rounded-3xl bg-white/10 p-4">
                      <reward.icon size={20} style={{ color: GOLD }} />
                      <p className="mt-3 text-sm font-black uppercase">{reward.pos}</p>
                      <p className="mt-1 text-xs font-bold uppercase leading-5 text-white/55">{reward.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "ranking" && (
        <div className="space-y-3 rounded-[32px] bg-white p-4 text-black sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-black/45">Tabla general</p>
              <h3 className="text-3xl font-black uppercase tracking-[-0.05em]">Ranking</h3>
            </div>
            <button onClick={shareRanking} className="rounded-full bg-black px-4 py-2.5 text-xs font-black uppercase text-white">
              Compartir
            </button>
          </div>
          {standings.length === 0 ? (
            <EmptyProde icon={Medal} title="Sin participantes" text="Hace tus pronosticos y apareces en el ranking." />
          ) : (
            <div className="mt-4 space-y-2">
              {standings.map((standing, index) => (
                <RankingRow key={standing.customer_id} standing={standing} rank={index + 1} isMe={standing.customer_id === customerId} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MatchPredictionCard({
  match,
  prediction,
  canPredict,
  saving,
  onChange,
  onSave,
}: {
  match: Match;
  prediction: { h: number | ""; a: number | ""; scorer: string; isSaved: boolean; points: number };
  canPredict: boolean;
  saving: boolean;
  onChange: (matchId: string, field: "h" | "a" | "scorer", value: string | number) => void;
  onSave: (matchId: string) => void;
}) {
  const closed = !canPredict && match.status !== "finished";
  const finished = match.status === "finished";

  return (
    <article className="rounded-3xl bg-black p-4 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
            <Calendar size={12} className="mr-1 inline" />
            {new Date(match.match_date).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-2 text-xl font-black uppercase tracking-[-0.04em]">
            {match.home_team} <span style={{ color: GOLD }}>vs</span> {match.away_team}
          </p>
        </div>
        <StatusPill finished={finished} closed={closed} saved={prediction.isSaved} />
      </div>

      {finished ? (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-3 text-black">
          <p className="text-2xl font-black">{match.home_score} - {match.away_score}</p>
          <p className="text-sm font-black uppercase" style={{ color: GOLD }}>{prediction.isSaved ? `+${prediction.points} pts` : "Sin pronostico"}</p>
        </div>
      ) : closed ? (
        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-bold uppercase text-white/65">
          Pronosticos cerrados {prediction.isSaved ? `/ Tu pronostico: ${prediction.h} - ${prediction.a}` : ""}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="flex items-center gap-2">
            <ScoreInput value={prediction.h} onChange={(value) => onChange(match.id, "h", value)} />
            <span className="font-black text-white/35">-</span>
            <ScoreInput value={prediction.a} onChange={(value) => onChange(match.id, "a", value)} />
          </div>
          <input
            value={prediction.scorer}
            onChange={(event) => onChange(match.id, "scorer", event.target.value)}
            className="min-h-12 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-bold text-white outline-none placeholder:text-white/35 focus:border-[#D6A100]"
            placeholder="Primer goleador (opcional)"
          />
          <button
            onClick={() => onSave(match.id)}
            disabled={saving || prediction.h === "" || prediction.a === ""}
            className="flex min-h-12 items-center justify-center rounded-full px-5 text-xs font-black uppercase text-black transition disabled:cursor-not-allowed disabled:opacity-35"
            style={{ backgroundColor: GOLD }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : prediction.isSaved ? "Actualizar" : "Guardar"}
          </button>
        </div>
      )}
    </article>
  );
}

function ScoreInput({ value, onChange }: { value: number | ""; onChange: (value: number | "") => void }) {
  return (
    <input
      type="number"
      min={0}
      max={15}
      value={value}
      onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
      className="h-12 w-14 rounded-2xl border border-white/10 bg-white text-center text-xl font-black text-black outline-none focus:border-[#D6A100]"
      placeholder="0"
    />
  );
}

function StatusPill({ finished, closed, saved }: { finished: boolean; closed: boolean; saved: boolean }) {
  const label = finished ? "Finalizado" : closed ? "Cerrado" : saved ? "Cargado" : "Abierto";
  return (
    <span className="inline-flex rounded-full px-3 py-1.5 text-[10px] font-black uppercase text-black" style={{ backgroundColor: finished || saved ? GOLD : closed ? "#FFFFFF55" : "#FFFFFF" }}>
      {label}
    </span>
  );
}

function RankingRow({ standing, rank, isMe, compact }: { standing: Standing; rank: number; isMe: boolean; compact?: boolean }) {
  const medal = rank === 1 ? "1" : rank === 2 ? "2" : rank === 3 ? "3" : String(rank);
  return (
    <div className={[
      "flex items-center gap-3 rounded-3xl p-3",
      isMe ? "bg-black text-white" : compact ? "bg-black/[0.04] text-black" : "bg-black/[0.04] text-black",
    ].join(" ")}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ backgroundColor: rank <= 3 ? GOLD : isMe ? "#FFFFFF22" : "#00000012", color: rank <= 3 ? "#000" : undefined }}>
        #{medal}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black uppercase">
          {standing.customers?.name || "Anonimo"} {isMe && <span style={{ color: GOLD }}>(vos)</span>}
        </p>
        <p className={["mt-1 text-[10px] font-bold uppercase", isMe ? "text-white/55" : "text-black/45"].join(" ")}>
          {standing.correct_results} exactos / {standing.correct_scorers} goleadores / {standing.perfect_predictions} perfectos
        </p>
      </div>
      <div className="text-right">
        <p className="text-xl font-black" style={{ color: isMe ? GOLD : undefined }}>{standing.total_points}</p>
        <p className={["text-[10px] font-black uppercase", isMe ? "text-white/45" : "text-black/35"].join(" ")}>pts</p>
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-white/10 p-4">
      <p className="text-3xl font-black tracking-[-0.05em]" style={{ color: GOLD }}>{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-black p-3 text-white">
      <p className="text-xl font-black" style={{ color: GOLD }}>{value}</p>
      <p className="text-[9px] font-black uppercase text-white/45">{label}</p>
    </div>
  );
}

function EmptyProde({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="rounded-[28px] bg-black p-8 text-center text-white">
      <Icon size={34} className="mx-auto" style={{ color: GOLD }} />
      <p className="mt-4 text-xl font-black uppercase tracking-[-0.04em]">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm font-bold uppercase leading-6 text-white/55">{text}</p>
    </div>
  );
}
