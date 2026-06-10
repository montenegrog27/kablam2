"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Save, Trophy, Users, Target, Medal, Star, TrendingUp, Calendar, Search, X, RefreshCw } from "lucide-react";

export default function ProdeAdminPage() {
  const [tenantId, setTenantId] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"matches" | "ranking" | "participants">("matches");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Form state
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [round, setRound] = useState("group");
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [firstScorer, setFirstScorer] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const [m, s] = await Promise.all([
      supabase.from("prode_matches").select("*").eq("tenant_id", r.tenant_id).order("match_date", { ascending: false }).limit(50),
      supabase.from("prode_standings").select("*, customers!customer_id(name, phone)").eq("tenant_id", r.tenant_id).order("total_points", { ascending: false }).limit(100),
    ]);
    setMatches(m.data || []);
    setStandings(s.data || []);
  };

  const resetForm = () => {
    setHomeTeam(""); setAwayTeam(""); setMatchDate(""); setRound("group");
    setHomeScore(""); setAwayScore(""); setFirstScorer("");
    setEditing(null); setShowForm(false);
  };

  const startEdit = (match: any) => {
    setEditing(match);
    setHomeTeam(match.home_team);
    setAwayTeam(match.away_team);
    setMatchDate(match.match_date?.slice(0, 16) || "");
    setRound(match.round || "group");
    setHomeScore(match.home_score !== null ? String(match.home_score) : "");
    setAwayScore(match.away_score !== null ? String(match.away_score) : "");
    setFirstScorer(match.first_scorer || "");
    setShowForm(true);
  };

  const saveMatch = async () => {
    if (!tenantId || !homeTeam || !awayTeam || !matchDate) return;
    setSaving(true);
    const data: any = {
      tenant_id: tenantId, home_team: homeTeam, away_team: awayTeam,
      match_date: new Date(matchDate).toISOString(), round,
      status: homeScore !== "" && awayScore !== "" ? "finished" : "pending",
    };
    if (homeScore !== "") data.home_score = Number(homeScore);
    if (awayScore !== "") data.away_score = Number(awayScore);
    if (firstScorer) data.first_scorer = firstScorer;

    if (editing) {
      await supabase.from("prode_matches").update(data).eq("id", editing.id);
    } else {
      await supabase.from("prode_matches").insert(data);
    }

    // If match finished, recalculate points for all predictions
    if (data.status === "finished" && (editing?.status !== "finished" || editing?.home_score !== data.home_score || editing?.away_score !== data.away_score)) {
      await recalcPoints(data, editing?.id || null);
    }

    resetForm(); load(); setSaving(false);
  };

  const recalcPoints = async (matchData: any, matchId: string | null) => {
    const id = matchId || matchData.id;
    const { data: predictions } = await supabase.from("prode_predictions").select("*").eq("match_id", id);
    if (!predictions) return;

    for (const pred of predictions) {
      let pts = 0, bonus = 0;
      if (pred.home_score === matchData.home_score && pred.away_score === matchData.away_score) pts += 5;
      const predTotal = (pred.home_score || 0) + (pred.away_score || 0);
      const actualTotal = (matchData.home_score || 0) + (matchData.away_score || 0);
      if (pred.first_scorer && matchData.first_scorer && pred.first_scorer.toLowerCase() === matchData.first_scorer.toLowerCase()) pts += 3;
      if (predTotal === actualTotal) pts += 2;
      if (pts >= 10) bonus = 3;

      await supabase.from("prode_predictions").update({ points_earned: pts, bonus_points: bonus, status: "finished" }).eq("id", pred.id);

      // Update standings
      await updateStanding(pred.customer_id, tenantId, pts, matchData, pred);
    }
  };

  const updateStanding = async (customerId: string, tid: string, pts: number, matchData: any, pred: any) => {
    const { data: existing } = await supabase.from("prode_standings").select("*").eq("tenant_id", tid).eq("customer_id", customerId).maybeSingle();
    const isExact = pred.home_score === matchData.home_score && pred.away_score === matchData.away_score;
    const isScorer = pred.first_scorer && matchData.first_scorer && pred.first_scorer.toLowerCase() === matchData.first_scorer.toLowerCase();
    const isGoals = ((pred.home_score || 0) + (pred.away_score || 0)) === ((matchData.home_score || 0) + (matchData.away_score || 0));
    const isPerfect = isExact && isScorer && isGoals;

    if (existing) {
      await supabase.from("prode_standings").update({
        total_points: existing.total_points + pts,
        correct_results: existing.correct_results + (isExact ? 1 : 0),
        correct_scorers: existing.correct_scorers + (isScorer ? 1 : 0),
        correct_goals: existing.correct_goals + (isGoals ? 1 : 0),
        perfect_predictions: existing.perfect_predictions + (isPerfect ? 1 : 0),
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("prode_standings").insert({
        tenant_id: tid, customer_id: customerId, total_points: pts,
        correct_results: isExact ? 1 : 0, correct_scorers: isScorer ? 1 : 0,
        correct_goals: isGoals ? 1 : 0, perfect_predictions: isPerfect ? 1 : 0,
      });
    }
  };

  const deleteMatch = async (id: string) => {
    if (!confirm("¿Eliminar partido?")) return;
    await supabase.from("prode_matches").delete().eq("id", id);
    load();
  };

  const syncArgentinaMatches = async () => {
    setSyncing(true);
    setSyncMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setSyncMessage("No hay sesion activa para sincronizar.");
      setSyncing(false);
      return;
    }

    try {
      const response = await fetch("/api/prode/sync-argentina", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "No se pudo sincronizar");
      if (data.failed?.length) {
        const firstError = data.failed[0];
        setSyncMessage(`ESPN encontro ${data.fetched || 0} partido(s), pero no pude guardar ${data.failed.length}. Primero: ${firstError.match} - ${firstError.error}`);
      } else if (data.imported > 0) {
        setSyncMessage(`Sincronizado: ${data.imported} partido(s). Proximo: ${data.nextMatch ? `${data.nextMatch.home_team} vs ${data.nextMatch.away_team}` : "sin futuro disponible"}`);
      } else if ((data.fetched || 0) > 0) {
        setSyncMessage(`ESPN encontro ${data.fetched} partido(s), pero no habia nuevos para guardar. Proximo: ${data.nextMatch ? `${data.nextMatch.home_team} vs ${data.nextMatch.away_team}` : "sin futuro disponible"}`);
      } else {
        setSyncMessage("ESPN no devolvio partidos de Argentina para el rango consultado.");
      }
      await load();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "No se pudo sincronizar");
    } finally {
      setSyncing(false);
    }
  };

  const totalParticipants = standings.length;
  const totalPredictions = matches.reduce((s, m) => s + (m.status === "finished" ? 1 : 0), 0);

  const filteredStandings = standings.filter((s) =>
    !search || s.customers?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const ROUND_LABELS: Record<string, string> = { group: "Grupos", round16: "8vos", quarter: "4tos", semi: "Semis", final: "Final" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><Trophy size={22} className="text-amber-400" /> Prode Mordisco</h1>
          <p className="text-sm text-gray-500 mt-0.5">{matches.length} partidos · {totalParticipants} participantes · {totalPredictions} finalizados</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncArgentinaMatches} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-500 transition disabled:opacity-50">
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} /> Sincronizar Argentina
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-500 transition">
            <Plus size={16} /> Nuevo partido
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="rounded-xl border border-sky-800 bg-sky-950/40 px-4 py-3 text-sm text-sky-200">
          {syncMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-xl p-1">
        {[
          { id: "matches", label: "Partidos", icon: Calendar },
          { id: "ranking", label: "Ranking", icon: Medal },
          { id: "participants", label: "Participantes", icon: Users },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === tab.id ? "bg-amber-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ===== MATCHES ===== */}
      {activeTab === "matches" && (
        <>
          {showForm && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-100">{editing ? "Editar" : "Nuevo"} partido</h3>
                <button onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800 text-gray-400"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)}
                  className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Local *" />
                <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)}
                  className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Visitante *" />
                <input type="datetime-local" value={matchDate} onChange={(e) => setMatchDate(e.target.value)}
                  className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" />
                <select value={round} onChange={(e) => setRound(e.target.value)}
                  className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                  <option value="group">Grupos</option><option value="round16">8vos</option><option value="quarter">4tos</option><option value="semi">Semis</option><option value="final">Final</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Local</label>
                  <input type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" placeholder="-" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Visitante</label>
                  <input type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" placeholder="-" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Primer goleador</label>
                  <input value={firstScorer} onChange={(e) => setFirstScorer(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Nombre" />
                </div>
              </div>
              <button onClick={saveMatch} disabled={!homeTeam || !awayTeam || !matchDate || saving}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-500 disabled:opacity-40 flex items-center gap-2">
                <Save size={14} /> {editing ? "Guardar cambios" : "Crear partido"}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {matches.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">Sin partidos</div>
            ) : matches.map((match) => (
              <div key={match.id} className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-4 flex items-center justify-between hover:bg-gray-800/30 transition cursor-pointer" onClick={() => startEdit(match)}>
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${match.status === "finished" ? "bg-emerald-500" : match.status === "live" ? "bg-red-500 animate-pulse" : "bg-gray-500"}`} />
                  <div>
                    <p className="font-semibold text-gray-100">
                      {match.home_team} <span className="text-amber-400">vs</span> {match.away_team}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-2">
                      <Calendar size={11} /> {new Date(match.match_date).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      <span className="text-gray-600">·</span>
                      {ROUND_LABELS[match.round] || match.round}
                      {match.first_scorer && <><span className="text-gray-600">·</span>⚽ {match.first_scorer}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {match.status === "finished" ? (
                    <span className="text-lg font-black text-gray-100">{match.home_score} - {match.away_score}</span>
                  ) : (
                    <span className="text-xs text-gray-600 px-2 py-1 rounded-full bg-gray-800">Pendiente</span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); deleteMatch(match.id); }} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== RANKING ===== */}
      {activeTab === "ranking" && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Participante</th>
                  <th className="px-4 py-3 text-right">Puntos</th>
                  <th className="px-4 py-3 text-right">Exactos</th>
                  <th className="px-4 py-3 text-right">Goleadores</th>
                  <th className="px-4 py-3 text-right">Goles</th>
                  <th className="px-4 py-3 text-right">Perfectos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {standings.map((s, idx) => {
                  const medals = ["🥇", "🥈", "🥉"];
                  const bg = idx < 3 ? idx === 0 ? "bg-amber-900/10" : idx === 1 ? "bg-gray-800/50" : "bg-orange-900/10" : "";
                  return (
                    <tr key={s.customer_id} className={`hover:bg-white/[0.02] ${bg}`}>
                      <td className="px-4 py-3 font-bold text-gray-500">{idx < 3 ? medals[idx] : `#${idx + 1}`}</td>
                      <td className="px-4 py-3 font-medium text-gray-100">{s.customers?.name || "Anónimo"}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-400">{s.total_points}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{s.correct_results}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{s.correct_scorers}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{s.correct_goals}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{s.perfect_predictions}</td>
                    </tr>
                  );
                })}
                {standings.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-500 text-sm">Sin participantes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== PARTICIPANTS ===== */}
      {activeTab === "participants" && (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500" placeholder="Buscar participante..." />
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Teléfono</th>
                  <th className="px-4 py-3 text-right">Puntos</th>
                  <th className="px-4 py-3 text-right">Exactos</th>
                  <th className="px-4 py-3 text-right">Goleadores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredStandings.map((s, idx) => (
                  <tr key={s.customer_id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-gray-100">{s.customers?.name || "Anónimo"}</td>
                    <td className="px-4 py-3 text-gray-400">{s.customers?.phone || "-"}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-400">{s.total_points}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{s.correct_results}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{s.correct_scorers}</td>
                  </tr>
                ))}
                {filteredStandings.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500 text-sm">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
