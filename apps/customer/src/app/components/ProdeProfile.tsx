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
  customer_id?: string;
  home_score: number;
  away_score: number;
  first_scorer?: string;
  points_earned: number;
  bonus_points: number;
  status: string;
  customers?: { name?: string };
  matches?: Match;
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

const RED = "#E10600";
const PRODE_ACCENT = RED;
const PREDICTION_LOCK_MINUTES = 5;
const ROUND_LABELS: Record<string, string> = {
  group: "Fase de grupos",
  round16: "Octavos",
  quarter: "Cuartos",
  semi: "Semifinal",
  final: "Final",
};
const ROUND_ORDER = ["group", "round16", "quarter", "semi", "final"];
const REWARDS = [
  { pos: "Resultado", desc: "Si le pegas al resultado: 1 Cheese Bacon Simple gratis.", icon: Target },
  { pos: "Goleador", desc: "Si tu jugador mete al menos 1 gol: 1 porcion de papas.", icon: Star },
  { pos: "Doble acierto", desc: "Si le pegas a los dos: 1 Cheese Bacon Doble con Papas.", icon: Gift },
];

const PRODE_TERMS_BROKEN = [
  "La participación es gratuita para todos los clientes registrados de Mordisco.",
  "Los pronósticos podrán realizarse o modificarse hasta 5 minutos antes del inicio oficial de cada partido.",
  "Una vez iniciado el partido, los pronósticos quedarán cerrados y no podrán modificarse.",
  "Los premios son personales e intransferibles.",
  "Para canjear el máximo premio (goleador y resultado juntos), el cliente deberá realizar una compra mínima de $5.000.",
  "El premio deberá utilizarse dentro de los 30 días posteriores a su obtención.",
  "Los premios no son canjeables por dinero en efectivo.",
  "En pedidos con delivery, el costo de envío deberá ser abonado por el cliente.",
  "El cliente podrá optar por retirar su premio en el local sin costo adicional.",
  "Mordisco se reserva el derecho de modificar, suspender o cancelar el Prode ante circunstancias excepcionales.",
  "La participación implica la aceptación total de estas bases y condiciones.",
];

const PRODE_TERMS = [
  "La participación es gratuita para todos los clientes registrados de Mordisco.",
  "Los pronósticos podrán realizarse o modificarse hasta 5 minutos antes del inicio oficial de cada partido.",
  "Una vez iniciado el partido, los pronósticos quedarán cerrados y no podrán modificarse.",
  "Los premios son personales e intransferibles.",
  "Para canjear el máximo premio (goleador y resultado juntos), el cliente deberá realizar una compra mínima de $5.000.",
  "El premio deberá utilizarse dentro de los 30 días posteriores a su obtención.",
  "Los premios no son canjeables por dinero en efectivo.",
  "En pedidos con delivery, el costo de envío deberá ser abonado por el cliente.",
  "El cliente podrá optar por retirar su premio en el local sin costo adicional.",
  "Mordisco se reserva el derecho de modificar, suspender o cancelar el Prode ante circunstancias excepcionales.",
  "La participación implica la aceptación total de estas bases y condiciones.",
];

const ARGENTINA_ATTACK_PLAYERS = [
  { group: "Jugadores", players: ["Lionel Messi", "Lautaro Martinez", "Julian Alvarez", "Nicolas Gonzalez", "Alejandro Garnacho", "Paulo Dybala", "Angel Correa", "Valentin Carboni", "Rodrigo De Paul", "Enzo Fernandez", "Alexis Mac Allister", "Leandro Paredes", "Giovani Lo Celso", "Exequiel Palacios", "Thiago Almada", "Nico Paz"] },
];

const SCORER_MESSAGES: Record<string, string> = {
  "Lionel Messi": "EPA! Asegurador! 😆",
  "Rodrigo De Paul": "Vamos motorcito!",
  "Julian Alvarez": "Sin dudas, la araña pica siempre! 🕷️",
  "Lautaro Martinez": "Vamos toro viejo!!",
};

function getScorerMessage(scorer?: string) {
  const cleanMessages: Record<string, string> = {
    "Lionel Messi": "EPA! Asegurador! 😆",
    "Rodrigo De Paul": "Vamos motorcito!",
    "Julian Alvarez": "Sin dudas, la araña pica siempre! 🕷️",
    "Lautaro Martinez": "Vamos toro viejo!!",
  };
  return scorer ? cleanMessages[scorer] || SCORER_MESSAGES[scorer] || "" : "";
}

export default function ProdeProfile({ branchSlug, customerId, tenantId }: { branchSlug: string; customerId?: string; tenantId?: string }) {
  const [tab, setTab] = useState<"predictions" | "ranking">("predictions");
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [myPredictions, setMyPredictions] = useState<Record<string, { h: number | ""; a: number | ""; scorer: string; saved?: boolean }>>({});
  const [savingMatchId, setSavingMatchId] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({});
  const [pendingMatchId, setPendingMatchId] = useState<string | null>(null);
  const [participationMessage, setParticipationMessage] = useState("");

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
    setAllPredictions(data.allPredictions || []);
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
      setParticipationMessage("Participaste en el Prode Mordisco");
      setTab("ranking");
    }
    setSavingMatchId(null);
    setPendingMatchId(null);
  };

  const requestSavePrediction = (matchId: string) => {
    const match = matches.find((item) => item.id === matchId);
    const pred = myPredictions[matchId];
    if (!match || !canPredict(match) || !pred || pred.h === "" || pred.a === "") return;
    setPendingMatchId(matchId);
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

  const predictionsByCustomer = useMemo(() => {
    const map = new Map<string, Prediction[]>();
    allPredictions.forEach((prediction) => {
      if (!prediction.customer_id) return;
      const current = map.get(prediction.customer_id) || [];
      current.push(prediction);
      map.set(prediction.customer_id, current);
    });
    return map;
  }, [allPredictions]);
  const visibleStandings = useMemo(() => {
    const map = new Map<string, Standing>();
    standings.forEach((standing) => {
      map.set(standing.customer_id, standing);
    });
    allPredictions.forEach((prediction) => {
      if (!prediction.customer_id || map.has(prediction.customer_id)) return;
      map.set(prediction.customer_id, {
        customer_id: prediction.customer_id,
        customers: prediction.customers,
        total_points: 0,
        correct_results: 0,
        correct_scorers: 0,
        correct_goals: 0,
        perfect_predictions: 0,
      });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      return (predictionsByCustomer.get(b.customer_id)?.length || 0) - (predictionsByCustomer.get(a.customer_id)?.length || 0);
    });
  }, [allPredictions, predictionsByCustomer, standings]);

  const myStanding = visibleStandings.find((s) => s.customer_id === customerId);
  const myRank = visibleStandings.findIndex((s) => s.customer_id === customerId) + 1;
  const savedPredictions = predictions.length;
  const podium = visibleStandings.slice(0, 3);
  const pendingMatch = pendingMatchId ? matches.find((match) => match.id === pendingMatchId) : null;
  const pendingPrediction = pendingMatchId ? myPredictions[pendingMatchId] : null;

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

  const isClosed = (match: Match) => new Date(match.match_date).getTime() - PREDICTION_LOCK_MINUTES * 60 * 1000 <= Date.now();
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
    <section className="space-y-4 text-white">
      <div className="overflow-hidden rounded-[34px] border border-black bg-black text-white">
        <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
          <div className="relative overflow-hidden p-5 sm:p-7">
            <div className="absolute right-[-80px] top-[-90px] h-56 w-56 rounded-full border border-[#E10600]/45" />
            <div className="absolute bottom-[-110px] left-[-90px] h-64 w-64 rounded-full border border-white/10" />
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15" style={{ backgroundColor: RED }}>
                <Trophy size={22} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/45">Mordisco Games</p>
                <h2 className="text-4xl font-black uppercase leading-[0.86] tracking-[-0.07em] sm:text-6xl">Prode<br />Mordisco</h2>
              </div>
            </div>

            <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Ranking" value={myRank > 0 ? `#${myRank}` : "-"} />
              <HeroMetric label="Puntos" value={String(myStanding?.total_points || 0)} />
              <HeroMetric label="Pronosticos" value={String(savedPredictions)} />
            </div>
          </div>

          <aside className="border-t border-white/10 bg-[#E10600] p-5 text-white lg:border-l lg:border-t-0 sm:p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/60">Ranking destacado</p>
            {podium.length === 0 ? (
              <div className="mt-5 rounded-3xl bg-black p-5 text-white">
                <Medal size={28} style={{ color: PRODE_ACCENT }} />
                <p className="mt-3 text-lg font-black uppercase">Todavia sin ranking</p>
                <p className="mt-1 text-sm font-bold text-white/55">Hace tu primer pronostico y aparece aca.</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {podium.map((standing, index) => (
                  <RankingRow key={standing.customer_id} standing={standing} predictions={predictionsByCustomer.get(standing.customer_id) || []} rank={index + 1} isMe={standing.customer_id === customerId} compact />
                ))}
              </div>
            )}
            <button onClick={shareRanking} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-black py-3 text-xs font-black uppercase text-white transition hover:border-[#E10600] hover:bg-[#E10600]">
              <Share2 size={15} /> Compartir posicion
            </button>
          </aside>
        </div>
      </div>

      {myStanding && (
        <div className="rounded-[30px] border border-black bg-black p-4 text-white">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Tu posicion actual</p>
              <p className="mt-1 text-3xl font-black uppercase tracking-[-0.05em]" style={{ color: PRODE_ACCENT }}>#{myRank} / {myStanding.total_points} pts</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <SmallStat label="Exactos" value={myStanding.correct_results} />
              <SmallStat label="Goleadores" value={myStanding.correct_scorers} />
              <SmallStat label="Perfectos" value={myStanding.perfect_predictions} />
            </div>
          </div>
        </div>
      )}

      {participationMessage && (
        <div className="rounded-[30px] border border-black bg-[#E10600] p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/60">Jugada confirmada</p>
          <p className="mt-1 text-3xl font-black uppercase tracking-[-0.05em]">{participationMessage}</p>
          <p className="mt-2 text-sm font-bold uppercase text-white/70">Ya estas en el ranking. Ahi podes ver tu jugada, las de los demas participantes y los aciertos.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-full border border-black bg-black p-1">
        <button onClick={() => setTab("predictions")} className={`rounded-full py-3 text-xs font-black uppercase transition ${tab === "predictions" ? "bg-[#E10600] text-white" : "text-white/60 hover:text-white"}`}>
          Mis pronosticos
        </button>
        <button onClick={() => setTab("ranking")} className={`rounded-full py-3 text-xs font-black uppercase transition ${tab === "ranking" ? "text-white" : "text-white/60 hover:text-white"}`} style={tab === "ranking" ? { backgroundColor: RED } : undefined}>
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
                  <div key={round} className="overflow-hidden rounded-[30px] border border-black bg-black text-white">
                    <button onClick={() => toggleRound(round)} className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-white/[0.06]">
                      <div>
                        <p className="text-lg font-black uppercase tracking-[-0.04em]">{label}</p>
                        <p className="text-xs font-bold uppercase text-white/45">{savedCount}/{roundMatches.length} cargados</p>
                      </div>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t border-white/10 p-3">
                        {roundMatches.map((match) => (
                          <MatchPredictionCard
                            key={match.id}
                            match={match}
                            prediction={getPredictionForMatch(match)}
                            canPredict={canPredict(match)}
                            saving={savingMatchId === match.id}
                            onChange={predictMatch}
                            onSave={requestSavePrediction}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="rounded-[30px] border border-black bg-black p-5 text-white">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em]" style={{ color: PRODE_ACCENT }}><Gift size={15} /> Premios del Prode</p>
                <p className="mt-2 text-sm font-bold uppercase leading-6 text-white/55">
                  Los premios se habilitan cuando se carga el resultado final del partido.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {REWARDS.map((reward) => (
                    <div key={reward.pos} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
                      <reward.icon size={20} style={{ color: PRODE_ACCENT }} />
                      <p className="mt-3 text-sm font-black uppercase">{reward.pos}</p>
                      <p className="mt-1 text-xs font-bold uppercase leading-5 text-white/55">{reward.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <ProdeTerms />
            </>
          )}
        </div>
      )}

      {tab === "ranking" && (
        <div className="space-y-3 rounded-[34px] border border-black bg-black p-4 text-white sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Tabla general</p>
              <h3 className="text-4xl font-black uppercase tracking-[-0.06em]">Ranking</h3>
            </div>
            <button onClick={shareRanking} className="rounded-full px-4 py-2.5 text-xs font-black uppercase text-white transition hover:bg-[#b80000]" style={{ backgroundColor: RED }}>
              Compartir
            </button>
          </div>
          {visibleStandings.length === 0 ? (
            <EmptyProde icon={Medal} title="Sin participantes" text="Hace tus pronosticos y apareces en el ranking." />
          ) : (
            <div className="mt-4 space-y-2">
              {visibleStandings.map((standing, index) => (
                <RankingRow key={standing.customer_id} standing={standing} predictions={predictionsByCustomer.get(standing.customer_id) || []} rank={index + 1} isMe={standing.customer_id === customerId} />
              ))}
            </div>
          )}
        </div>
      )}

      {pendingMatch && pendingPrediction && (
        <ConfirmPredictionModal
          match={pendingMatch}
          prediction={pendingPrediction}
          saving={savingMatchId === pendingMatch.id}
          onCancel={() => setPendingMatchId(null)}
          onConfirm={() => submitPrediction(pendingMatch.id)}
        />
      )}
    </section>
  );
}

function ProdeTerms() {
  return (
    <div className="rounded-[30px] border border-black bg-black p-5 text-white">
      <p className="text-xs font-black uppercase tracking-[0.22em]" style={{ color: PRODE_ACCENT }}>
        Bases y condiciones - Prode Mordisco
      </p>
      <ol className="mt-4 space-y-3 text-sm font-bold leading-6 text-white/60">
        {PRODE_TERMS.map((term, index) => (
          <li key={term} className="grid grid-cols-[24px_1fr] gap-2">
            <span className="font-black" style={{ color: PRODE_ACCENT }}>{index + 1}.</span>
            <span>{term}</span>
          </li>
        ))}
      </ol>
    </div>
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
  const scorerMessage = getScorerMessage(prediction.scorer);

  return (
    <article className="rounded-[28px] border border-white/10 bg-[#0A0A0A] p-4 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
            <Calendar size={12} className="mr-1 inline" />
            {new Date(match.match_date).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-2 text-xl font-black uppercase tracking-[-0.04em]">
            {match.home_team} <span style={{ color: PRODE_ACCENT }}>vs</span> {match.away_team}
          </p>
        </div>
        <StatusPill finished={finished} closed={closed} saved={prediction.isSaved} />
      </div>

      {finished ? (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/[0.06] p-3 text-white">
          <p className="text-2xl font-black">{match.home_score} - {match.away_score}</p>
          <p className="text-sm font-black uppercase" style={{ color: PRODE_ACCENT }}>{prediction.isSaved ? `+${prediction.points} pts` : "Sin pronostico"}</p>
        </div>
      ) : closed ? (
        <div className="mt-4 rounded-2xl bg-white/10 p-3 text-sm font-bold uppercase text-white/65">
          Pronosticos cerrados 5 minutos antes del inicio {prediction.isSaved ? `/ Tu pronostico: ${prediction.h} - ${prediction.a}` : ""}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <div className="flex items-center gap-2">
            <ScoreInput value={prediction.h} onChange={(value) => onChange(match.id, "h", value)} />
            <span className="font-black text-white/35">-</span>
            <ScoreInput value={prediction.a} onChange={(value) => onChange(match.id, "a", value)} />
          </div>
          <div className="space-y-2">
            <select
              value={prediction.scorer}
              onChange={(event) => onChange(match.id, "scorer", event.target.value)}
              className="min-h-12 w-full rounded-full border border-white/10 bg-black px-4 text-sm font-bold text-white outline-none focus:border-[#E10600]"
            >
              <option value="" className="bg-black text-white">Goleador argentino (opcional)</option>
              {ARGENTINA_ATTACK_PLAYERS.map((group) => (
                <optgroup key={group.group} label={group.group} className="bg-black text-white">
                  {group.players.map((player) => (
                    <option key={player} value={player} className="bg-black text-white">{player}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {scorerMessage && (
              <p className="rounded-2xl border border-[#E10600]/35 bg-[#E10600]/10 px-4 py-2 text-xs font-black uppercase leading-5 text-white">
                {scorerMessage}
              </p>
            )}
          </div>
          <button
            onClick={() => onSave(match.id)}
            disabled={saving || prediction.h === "" || prediction.a === ""}
            className="flex min-h-12 items-center justify-center rounded-full px-5 text-xs font-black uppercase text-white transition disabled:cursor-not-allowed disabled:opacity-35"
            style={{ backgroundColor: RED }}
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
      className="h-12 w-14 rounded-2xl border border-white/10 bg-white/[0.08] text-center text-xl font-black text-white outline-none focus:border-[#E10600]"
      placeholder="0"
    />
  );
}

function ConfirmPredictionModal({
  match,
  prediction,
  saving,
  onCancel,
  onConfirm,
}: {
  match: Match;
  prediction: { h: number | ""; a: number | ""; scorer: string; saved?: boolean };
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const scorerMessage = getScorerMessage(prediction.scorer);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-3 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-[34px] border border-[#E10600] bg-black text-white">
        <div className="bg-[#E10600] p-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-white/70">Confirmar jugada</p>
          <h3 className="mt-2 text-3xl font-black uppercase leading-none tracking-[-0.05em]">Aceptar pronostico</h3>
          <p className="mt-3 text-sm font-bold uppercase leading-6 text-white/60">Despues de aceptar, participas en el Prode Mordisco con esta jugada.</p>
        </div>

        <div className="p-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
              {new Date(match.match_date).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="mt-2 text-xl font-black uppercase tracking-[-0.04em]">
              {match.home_team} <span style={{ color: PRODE_ACCENT }}>vs</span> {match.away_team}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-black p-3 text-white">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Resultado</p>
                <p className="mt-1 text-3xl font-black" style={{ color: PRODE_ACCENT }}>{prediction.h} - {prediction.a}</p>
              </div>
              <div className="rounded-2xl bg-black p-3 text-white">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Goleador</p>
                <p className="mt-2 text-sm font-black uppercase leading-5" style={{ color: PRODE_ACCENT }}>{prediction.scorer || "Sin elegir"}</p>
              </div>
            </div>
            {scorerMessage && (
              <p className="mt-3 rounded-2xl border border-[#E10600]/35 bg-[#E10600]/10 px-4 py-3 text-xs font-black uppercase leading-5 text-white">
                {scorerMessage}
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="rounded-full border border-white/15 py-4 text-xs font-black uppercase text-white transition hover:border-[#E10600] hover:bg-[#E10600] disabled:opacity-40"
            >
              Revisar
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="flex items-center justify-center rounded-full py-4 text-xs font-black uppercase text-white transition disabled:opacity-40"
              style={{ backgroundColor: RED }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : "Aceptar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ finished, closed, saved }: { finished: boolean; closed: boolean; saved: boolean }) {
  const label = finished ? "Finalizado" : closed ? "Cerrado" : saved ? "Cargado" : "Abierto";
  return (
    <span className="inline-flex rounded-full px-3 py-1.5 text-[10px] font-black uppercase text-white" style={{ backgroundColor: finished || saved ? RED : closed ? "#3A3A3A" : "#111111" }}>
      {label}
    </span>
  );
}

function RankingRow({ standing, predictions, rank, isMe, compact }: { standing: Standing; predictions: Prediction[]; rank: number; isMe: boolean; compact?: boolean }) {
  const medal = rank === 1 ? "1" : rank === 2 ? "2" : rank === 3 ? "3" : String(rank);
  return (
    <div className={[
      "rounded-3xl border p-3",
      isMe ? "border-[#E10600] bg-black text-white" : compact ? "border-white/10 bg-black text-white" : "border-white/10 bg-white/[0.06] text-white",
    ].join(" ")}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ backgroundColor: rank <= 3 ? RED : isMe ? "#000000" : "#FFFFFF18" }}>
          #{medal}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black uppercase">
            {standing.customers?.name || "Anonimo"} {isMe && <span className="text-yellow-500">(vos)</span>}
          </p>
          <p className={["mt-1 text-[10px] font-bold uppercase", isMe ? "text-white/70" : "text-white/45"].join(" ")}>
            {standing.correct_results} exactos / {standing.correct_scorers} goleadores / {standing.perfect_predictions} perfectos
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black" style={{ color: isMe ? "#FFFFFF" : undefined }}>{standing.total_points}</p>
          <p className={["text-[10px] font-black uppercase", isMe ? "text-white/55" : "text-white/35"].join(" ")}>pts</p>
        </div>
      </div>
      {!compact && (
        <div className="mt-3 space-y-2">
          {predictions.length === 0 ? (
            <p className={["rounded-2xl px-3 py-2 text-[10px] font-black uppercase", isMe ? "bg-black/20 text-white/70" : "bg-black text-white/45"].join(" ")}>
              Todavia no tiene jugadas cargadas.
            </p>
          ) : (
            predictions.slice(0, 4).map((prediction) => (
              <PredictionSummary key={prediction.id} prediction={prediction} isMe={isMe} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PredictionSummary({ prediction, isMe }: { prediction: Prediction; isMe: boolean }) {
  const match = prediction.matches;
  const finished = prediction.status === "finished" || match?.status === "finished";
  return (
    <div className={["rounded-2xl border px-3 py-2 text-xs", isMe ? "border-black/10 bg-black/20 text-white" : "border-white/10 bg-black text-white"].join(" ")}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-black uppercase">
          {match ? `${match.home_team} vs ${match.away_team}` : "Partido"}
        </p>
        <span className="shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase text-white" style={{ backgroundColor: RED }}>
          {prediction.points_earned || 0} pts
        </span>
      </div>
      <p className={["mt-1 font-bold uppercase", isMe ? "text-white/70" : "text-white/50"].join(" ")}>
        Jugo {prediction.home_score}-{prediction.away_score}
        {prediction.first_scorer ? ` / Gol: ${prediction.first_scorer}` : ""}
        {finished && match ? ` / Real: ${match.home_score ?? "-"}-${match.away_score ?? "-"}` : ""}
      </p>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <p className="text-3xl font-black tracking-[-0.05em] text-white">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-white">
      <p className="text-xl font-black">{value}</p>
      <p className="text-[9px] font-black uppercase text-white/45">{label}</p>
    </div>
  );
}

function EmptyProde({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="rounded-[28px] bg-black p-8 text-center text-white">
      <Icon size={34} className="mx-auto" style={{ color: PRODE_ACCENT }} />
      <p className="mt-4 text-xl font-black uppercase tracking-[-0.04em]">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm font-bold uppercase leading-6 text-white/55">{text}</p>
    </div>
  );
}
