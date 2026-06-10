"use client";
import { useEffect, useState, useMemo } from "react";
import { Trophy, Star, Target, Calendar, Medal, TrendingUp, Loader2, Share2, Gift, ChevronDown, ChevronUp, Zap } from "lucide-react";

type Match = { id: string; home_team: string; away_team: string; match_date: string; home_score?: number; away_score?: number; status: string; round: string };
type Prediction = { id: string; match_id: string; home_score: number; away_score: number; first_scorer?: string; total_goals?: number; points_earned: number; bonus_points: number; status: string; matches?: Match };
type Standing = { customer_id: string; customers?: { name?: string }; total_points: number; correct_results: number; correct_scorers: number; correct_goals: number; perfect_predictions: number };

const ROUND_LABELS: Record<string, string> = { group: "Fase de Grupos", round16: "Octavos de Final", quarter: "Cuartos de Final", semi: "Semifinal", final: "Final" };
const ROUND_ORDER = ["group", "round16", "quarter", "semi", "final"];
const REWARDS = [
  { pos: "Top 10", desc: "Cupón de descuento", icon: Gift },
  { pos: "Resultado exacto", desc: "Beneficio en próxima compra", icon: Star },
  { pos: "Participar", desc: "Suma puntos Mordisco", icon: Zap },
];

export default function ProdeProfile({ branchSlug, customerId, tenantId }: { branchSlug: string; customerId?: string; tenantId?: string }) {
  const [tab, setTab] = useState<"predictions" | "ranking">("predictions");
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [prevStanding, setPrevStanding] = useState<number | null>(null);
  const [myPredictions, setMyPredictions] = useState<Record<string, { h: number; a: number; scorer: string; saved?: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [expandedRounds, setExpandedRounds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!customerId) return;
    load();
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [customerId]);

  const load = async () => {
    if (!tenantId) return;
    const response = await fetch("/api/prode", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;
    const newStandings: Standing[] = data.standings || [];
    // Detect rank change
    const myNewRank = newStandings.findIndex((st) => st.customer_id === customerId) + 1;
    if (prevStanding !== null && myNewRank > 0 && prevStanding > 0 && myNewRank !== prevStanding) {
      // Store the change
    }
    if (prevStanding === null && myNewRank > 0) setPrevStanding(myNewRank);
    setMatches(data.matches || []);
    setPredictions(data.predictions || []);
    setStandings(newStandings);
  };

  const getPrediction = (matchId: string) => predictions.find((p) => p.match_id === matchId);

  const submitPrediction = async (matchId: string) => {
    const pred = myPredictions[matchId];
    if (!pred || !customerId || !tenantId) return;
    setSaving(true);
    const response = await fetch("/api/prode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId,
        homeScore: pred.h,
        awayScore: pred.a,
        firstScorer: pred.scorer || "",
      }),
    });
    if (response.ok) {
      setMyPredictions((prev) => ({ ...prev, [matchId]: { ...prev[matchId], saved: true } }));
    }
    setSaving(false);
    load();
  };

  const predictMatch = (matchId: string, field: string, value: any) => {
    setMyPredictions((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId] || { h: 0, a: 0, scorer: "" }, [field]: value, saved: false },
    }));
  };

  const myStanding = standings.find((s) => s.customer_id === customerId);
  const myRank = standings.findIndex((s) => s.customer_id === customerId) + 1;
  const myPrevRank = prevStanding;
  const rankChange = myPrevRank && myRank ? myPrevRank - myRank : 0;

  // Group matches by round
  const matchesByRound = useMemo(() => {
    const grouped: Record<string, Match[]> = {};
    ROUND_ORDER.forEach((r) => grouped[r] = []);
    matches.forEach((m) => {
      const key = ROUND_ORDER.includes(m.round) ? m.round : "group";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
    return ROUND_ORDER.filter((r) => (grouped[r] || []).length > 0).map((r) => ({ round: r, label: ROUND_LABELS[r], matches: grouped[r] }));
  }, [matches]);

  const isClosed = (match: Match) => new Date(match.match_date).getTime() <= Date.now();
  const getPredictionForMatch = (match: Match) => {
    const pred = getPrediction(match.id);
    const localPred = myPredictions[match.id];
    return {
      h: localPred?.h ?? pred?.home_score ?? "",
      a: localPred?.a ?? pred?.away_score ?? "",
      scorer: localPred?.scorer ?? pred?.first_scorer ?? "",
      isSaved: pred || localPred?.saved,
    };
  };

  const shareRanking = () => {
    const text = `🏆 Prode Mordisco\n\nEstoy #${myRank} con ${myStanding?.total_points || 0} puntos!\n\n${window.location.origin}/${branchSlug}/account/profile\n\nUnite al Prode y competí por premios!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const toggleRound = (round: string) => setExpandedRounds((prev) => ({ ...prev, [round]: !prev[round] }));

  const canPredict = (match: Match) => match.status === "pending" && !isClosed(match);

  const formatDate = (d: string) => new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const formatDateShort = (d: string) => new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "short" });

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
            <Trophy size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">⚽ Prode Mordisco 2026</h2>
            <p className="text-sm text-gray-500">Predecí resultados y ganá premios</p>
          </div>
        </div>
        <button onClick={shareRanking} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition">
          <Share2 size={13} /> Compartir
        </button>
      </div>

      {/* Position highlight */}
      {myStanding && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-3 mb-4 border border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-lg">#{myRank}</div>
            <div>
              <p className="font-bold text-gray-900">{myStanding.total_points} pts</p>
              <p className="text-xs text-gray-500">{myStanding.correct_results} exactos · {myStanding.correct_scorers} goleadores</p>
            </div>
          </div>
          <div className="text-right">
            {rankChange > 0 && <p className="text-xs font-bold text-emerald-600">↑ {rankChange} posiciones</p>}
            {rankChange < 0 && <p className="text-xs font-bold text-red-600">↓ {Math.abs(rankChange)} posiciones</p>}
            {rankChange === 0 && <p className="text-xs text-gray-400">Sin cambios</p>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4">
        <button onClick={() => setTab("predictions")}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${tab === "predictions" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          Mis pronosticos
        </button>
        <button onClick={() => setTab("ranking")}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${tab === "ranking" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          Ranking
        </button>
      </div>

      {/* TAB: Predictions */}
      {tab === "predictions" && (() => {
        const totalPredictions = predictions.length;
        return (
          <div className="space-y-4">
            {matches.length === 0 ? (
              <div className="text-center py-8">
                <Target size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="font-semibold text-gray-700">Participá en el Prode Mordisco</p>
                <p className="text-sm text-gray-500 mt-1">Los partidos aparecerán aquí cuando estén disponibles</p>
              </div>
            ) : (
              <>
                {/* Rounds */}
                {matchesByRound.map(({ round, label, matches: roundMatches }) => {
                  const isOpen = expandedRounds[round] !== false;
                  return (
                    <div key={round} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button onClick={() => toggleRound(round)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition">
                        <span className="font-bold text-gray-900">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{roundMatches.filter((m) => getPrediction(m.id)).length}/{roundMatches.length}</span>
                          {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="divide-y divide-gray-100">
                          {roundMatches.map((match) => {
                            const pred = getPredictionForMatch(match);
                            const closed = isClosed(match);
                            const finished = match.status === "finished";
                            const canPredict_ = canPredict(match);
                            return (
                              <div key={match.id} className="px-4 py-3 space-y-2 hover:bg-gray-50/50 transition">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-semibold text-gray-900 text-sm truncate">{match.home_team}</span>
                                    <span className="text-amber-500 text-xs font-bold">vs</span>
                                    <span className="font-semibold text-gray-900 text-sm truncate">{match.away_team}</span>
                                  </div>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${closed ? 'bg-red-100 text-red-600' : finished ? 'bg-gray-100 text-gray-600' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {finished ? 'Finalizado' : closed ? 'Cerrada' : formatDateShort(match.match_date)}
                                  </span>
                                </div>

                                {finished ? (
                                  <div className="bg-gray-50 rounded-xl p-2.5 flex items-center justify-between">
                                    <span className="font-bold text-lg text-gray-900">{match.home_score} - {match.away_score}</span>
                                    {pred.isSaved && <span className="text-xs font-bold text-emerald-600">+{getPrediction(match.id)?.points_earned || 0} pts</span>}
                                    {!pred.isSaved && <span className="text-xs text-gray-400">Sin pronostico</span>}
                                  </div>
                                ) : closed ? (
                                  <div className="bg-red-50 rounded-xl p-2.5 text-center">
                                    <p className="text-xs font-medium text-red-600">Pronosticos cerrados · El partido comienza pronto</p>
                                    {pred.isSaved && <p className="text-xs text-gray-500 mt-1">Tu pronostico: {pred.h} - {pred.a} {pred.scorer ? `· ⚽ ${pred.scorer}` : ""}</p>}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <input type="number" min={0} max={15} value={pred.h} onChange={(e) => predictMatch(match.id, "h", Number(e.target.value))}
                                      className="w-12 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-bold" placeholder="0" disabled={!canPredict_} />
                                    <span className="text-gray-400 font-bold">-</span>
                                    <input type="number" min={0} max={15} value={pred.a} onChange={(e) => predictMatch(match.id, "a", Number(e.target.value))}
                                      className="w-12 text-center border border-gray-200 rounded-lg py-1.5 text-sm font-bold" placeholder="0" disabled={!canPredict_} />
                                    <input value={pred.scorer} onChange={(e) => predictMatch(match.id, "scorer", e.target.value)}
                                      className="w-24 border border-gray-200 rounded-lg py-1.5 px-2 text-xs" placeholder="Goleador" disabled={!canPredict_} />
                                    {canPredict_ && (
                                      <button onClick={() => submitPrediction(match.id)} disabled={saving || String(pred.h) === "" || String(pred.a) === ""}
                                        className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-black transition disabled:opacity-40">
                                        {pred.isSaved ? "Actualizar" : "Guardar"}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Rewards section */}
                <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl p-4 border border-amber-200 space-y-3">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1"><Gift size={14} /> Premios</p>
                  {REWARDS.map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <r.icon size={16} className="text-amber-600" />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.pos}</p>
                        <p className="text-xs text-gray-600">{r.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* TAB: Ranking */}
      {tab === "ranking" && (
        <div className="space-y-2">
          {standings.length === 0 ? (
            <div className="text-center py-8">
              <Medal size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-700">Sé el primero en participar</p>
              <p className="text-sm text-gray-500 mt-1">Hacé tus predicciones y aparecés en el ranking</p>
            </div>
          ) : (
            <>
              <button onClick={shareRanking} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 transition flex items-center justify-center gap-2 mb-2">
                <Share2 size={16} /> Compartir mi posición por WhatsApp
              </button>
              {standings.map((s, idx) => {
                const isMe = s.customer_id === customerId;
                const medals = ["🥇", "🥈", "🥉"];
                const bg = idx === 0 ? "bg-amber-50 border-amber-200" : idx === 1 ? "bg-gray-50 border-gray-200" : idx === 2 ? "bg-orange-50 border-orange-200" : "bg-white border-gray-100";
                return (
                  <div key={s.customer_id} className={`rounded-xl border p-3 flex items-center gap-3 transition-all duration-300 ${bg} ${isMe ? "ring-2 ring-gray-900 scale-[1.02]" : ""}`}>
                    <span className="w-8 text-center font-bold text-gray-500 text-lg">{idx < 3 ? medals[idx] : `#${idx + 1}`}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{s.customers?.name || "Anónimo"}{isMe && <span className="text-amber-600 font-bold"> (vos)</span>}</p>
                      <p className="text-xs text-gray-500">{s.correct_results} exactos · {s.correct_scorers} goleadores · {s.correct_goals} goles</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-gray-900">{s.total_points}</p>
                      <p className="text-[10px] text-gray-500">pts</p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </section>
  );
}
