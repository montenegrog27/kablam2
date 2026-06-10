"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Banknote,
  Building2,
  CheckCircle2,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";

type Branch = {
  id: string;
  name: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  branch_id?: string | null;
  cash_register_id?: string | null;
};

type Movement = {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  account_id: string;
  type: string;
  amount: number;
  description: string;
  payment_method_name?: string | null;
  metadata?: any;
  created_at: string;
};

type MovementKind = "manual_in" | "manual_out" | "adjustment";

const money = (value: number) => `$${Math.round(value || 0).toLocaleString("es-AR")}`;

function todayInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function movementTone(type: string) {
  if (["manual_in", "transfer_in", "cash_closure_in", "petty_cash_balance"].includes(type)) return "text-emerald-300";
  if (["manual_out", "transfer_out", "expense_out", "purchase_out"].includes(type)) return "text-rose-300";
  return "text-amber-300";
}

function movementSign(type: string) {
  if (["manual_out", "transfer_out", "expense_out", "purchase_out"].includes(type)) return "-";
  return "+";
}

export default function PettyCashPage() {
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [centralAccounts, setCentralAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const [movementKind, setMovementKind] = useState<MovementKind>("manual_out");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [movementDate, setMovementDate] = useState(todayInput());
  const [realBalance, setRealBalance] = useState("");

  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferReason, setTransferReason] = useState("");

  useEffect(() => { load(); }, []);

  const branchAccounts = useMemo(
    () => accounts.filter((account) => !selectedBranchId || account.branch_id === selectedBranchId),
    [accounts, selectedBranchId],
  );

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || branchAccounts[0],
    [accounts, selectedAccountId, branchAccounts],
  );

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId);
  const totalPettyCash = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const branchTotal = branchAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const incomingToday = movements
    .filter((movement) => movement.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .filter((movement) => movementSign(movement.type) === "+")
    .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const outgoingToday = movements
    .filter((movement) => movement.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .filter((movement) => movementSign(movement.type) === "-")
    .reduce((sum, movement) => sum + Number(movement.amount || 0), 0);

  const visibleMovements = movements.filter((movement) => {
    const inBranch = !selectedBranchId || movement.branch_id === selectedBranchId;
    const inAccount = !selectedAccountId || movement.account_id === selectedAccountId;
    const text = `${movement.description} ${movement.payment_method_name || ""} ${movement.type}`.toLowerCase();
    return inBranch && inAccount && text.includes(query.toLowerCase());
  });

  const load = async () => {
    setLoading(true);
    setMessage("");

    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) return;
    setUserId(authUser.id);

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", authUser.id)
      .single();
    if (!userRecord?.tenant_id) return;
    setTenantId(userRecord.tenant_id);

    const { data: branchRows } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");
    const loadedBranches = (branchRows || []) as Branch[];
    setBranches(loadedBranches);

    await ensureBranchPettyAccounts(userRecord.tenant_id, loadedBranches);

    const [{ data: accountRows }, { data: centralRows }] = await Promise.all([
      supabase
        .from("central_cash_accounts")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("type", "petty_cash")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("central_cash_accounts")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .neq("type", "petty_cash")
        .eq("is_active", true)
        .order("name"),
    ]);

    const loadedAccounts = (accountRows || []) as Account[];
    setAccounts(loadedAccounts);
    setCentralAccounts((centralRows || []) as Account[]);

    const accountIds = loadedAccounts.map((account) => account.id);
    const { data: movementRows } = accountIds.length > 0
      ? await supabase
        .from("central_cash_movements")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .in("account_id", accountIds)
        .order("created_at", { ascending: false })
        .limit(300)
      : { data: [] };

    setMovements((movementRows || []) as Movement[]);

    const nextBranchId = selectedBranchId || loadedBranches[0]?.id || "";
    const nextAccount = loadedAccounts.find((account) => account.branch_id === nextBranchId) || loadedAccounts[0];
    setSelectedBranchId(nextBranchId);
    if (!selectedAccountId || !loadedAccounts.some((account) => account.id === selectedAccountId)) {
      setSelectedAccountId(nextAccount?.id || "");
    }
    if (!transferFromId) setTransferFromId((centralRows || [])[0]?.id || "");
    if (!transferToId) setTransferToId(nextAccount?.id || "");

    setLoading(false);
  };

  const ensureBranchPettyAccounts = async (tenant: string, branchRows: Branch[]) => {
    for (const branch of branchRows) {
      const name = `Caja chica - ${branch.name}`;
      await supabase.from("central_cash_accounts").upsert({
        tenant_id: tenant,
        branch_id: branch.id,
        type: "petty_cash",
        name,
        is_active: true,
      }, { onConflict: "tenant_id,type,name" });
    }
  };

  const applyMovement = async ({
    account,
    type,
    value,
    label,
    metadata = {},
  }: {
    account: Account;
    type: string;
    value: number;
    label: string;
    metadata?: Record<string, any>;
  }) => {
    const { error } = await supabase.rpc("apply_central_cash_movement", {
      p_tenant_id: tenantId,
      p_branch_id: account.branch_id || selectedBranchId || null,
      p_account_id: account.id,
      p_cash_closure_id: null,
      p_cash_session_id: null,
      p_expense_id: null,
      p_type: type,
      p_amount: value,
      p_description: label,
      p_payment_method_name: account.name,
      p_created_by: userId,
      p_metadata: metadata,
    });
    if (error) throw new Error(error.message);
  };

  const saveMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    const account = selectedAccount;
    const value = movementKind === "adjustment"
      ? Math.abs(Number(realBalance || 0) - Number(account?.balance || 0))
      : Number(amount || 0);

    if (!tenantId || !account || value <= 0) return;
    if (movementKind !== "adjustment" && !description.trim()) {
      setMessage("Escribe una descripcion.");
      return;
    }
    if (movementKind === "adjustment" && realBalance === "") {
      setMessage("Ingresa el saldo real contado.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      if (movementKind === "adjustment") {
        const target = Number(realBalance || 0);
        const current = Number(account.balance || 0);
        const delta = target - current;
        if (delta === 0) {
          setMessage("La caja ya coincide con ese saldo.");
          setSaving(false);
          return;
        }
        await applyMovement({
          account,
          type: delta > 0 ? "manual_in" : "manual_out",
          value: Math.abs(delta),
          label: `Ajuste de caja chica: ${description.trim() || "conteo real"}`,
          metadata: {
            operation: "petty_cash_adjustment",
            previous_balance: current,
            adjusted_balance: target,
            delta,
            movement_date: movementDate,
          },
        });
      } else {
        await applyMovement({
          account,
          type: movementKind,
          value,
          label: description.trim(),
          metadata: {
            operation: "petty_cash_manual_movement",
            movement_date: movementDate,
          },
        });
      }

      setAmount("");
      setRealBalance("");
      setDescription("");
      setMovementDate(todayInput());
      setMessage("Movimiento registrado");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "No se pudo registrar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const transferCash = async (event: React.FormEvent) => {
    event.preventDefault();
    const from = [...centralAccounts, ...accounts].find((account) => account.id === transferFromId);
    const to = [...centralAccounts, ...accounts].find((account) => account.id === transferToId);
    const value = Number(transferAmount || 0);
    if (!from || !to || from.id === to.id || value <= 0 || !transferReason.trim()) return;

    setSaving(true);
    setMessage("");
    const transferId = crypto.randomUUID();

    try {
      await applyMovement({
        account: from,
        type: "transfer_out",
        value,
        label: `Transferencia a ${to.name}: ${transferReason.trim()}`,
        metadata: { operation: "petty_cash_transfer", transfer_id: transferId, to_account_id: to.id },
      });
      await applyMovement({
        account: to,
        type: "transfer_in",
        value,
        label: `Transferencia desde ${from.name}: ${transferReason.trim()}`,
        metadata: { operation: "petty_cash_transfer", transfer_id: transferId, from_account_id: from.id },
      });
      setTransferAmount("");
      setTransferReason("");
      setMessage("Transferencia registrada");
      await load();
    } catch (error: any) {
      setMessage(error?.message || "No se pudo transferir dinero.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando caja chica...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="sticky top-0 z-20 -mx-4 border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-100 md:text-2xl">Caja Chica</h1>
            <p className="text-xs text-gray-500 md:text-sm">Saldos y movimientos por sucursal</p>
          </div>
          <button onClick={load} className="rounded-xl border border-gray-700 bg-gray-900 p-3 text-gray-300">
            <RefreshCw size={18} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Total caja chica" value={money(totalPettyCash)} tone="white" />
          <Kpi label={selectedBranch?.name || "Sucursal"} value={money(branchTotal)} tone="blue" />
          <Kpi label="Ingresos hoy" value={money(incomingToday)} tone="emerald" />
          <Kpi label="Egresos hoy" value={money(outgoingToday)} tone="rose" />
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          <CheckCircle2 size={16} className="mr-2 inline" />
          {message}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <label className="text-xs font-black uppercase tracking-wide text-gray-500">
              Sucursal
              <select
                className="input mt-2"
                value={selectedBranchId}
                onChange={(event) => {
                  const branch = event.target.value;
                  const first = accounts.find((account) => account.branch_id === branch);
                  setSelectedBranchId(branch);
                  setSelectedAccountId(first?.id || "");
                  setTransferToId(first?.id || "");
                }}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            {branchAccounts.map((account) => (
              <button
                key={account.id}
                onClick={() => {
                  setSelectedAccountId(account.id);
                  setTransferToId(account.id);
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${selectedAccount?.id === account.id ? "border-blue-400 bg-blue-950/40" : "border-gray-800 bg-gray-900 hover:border-gray-700"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-gray-100">{account.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{account.cash_register_id ? "Caja registradora" : "Sucursal"}</p>
                  </div>
                  <Wallet size={18} className="text-blue-300" />
                </div>
                <p className="mt-3 text-2xl font-black tabular-nums text-gray-100">{money(Number(account.balance || 0))}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-4">
          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Registrar movimiento" icon={Banknote}>
              <form onSubmit={saveMovement} className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["manual_out", "Egreso"],
                    ["manual_in", "Ingreso"],
                    ["adjustment", "Ajuste"],
                  ] as [MovementKind, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMovementKind(value)}
                      className={`rounded-xl border px-3 py-3 text-sm font-black ${movementKind === value ? "border-blue-400 bg-blue-400 text-gray-950" : "border-gray-700 bg-gray-950 text-gray-300"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="block text-xs text-gray-500">
                  Cuenta
                  <select className="input mt-1" value={selectedAccount?.id || ""} onChange={(event) => setSelectedAccountId(event.target.value)}>
                    {branchAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  {movementKind === "adjustment" ? (
                    <label className="text-xs text-gray-500">
                      Saldo real contado
                      <input className="input mt-1" type="number" step="0.01" value={realBalance} onChange={(event) => setRealBalance(event.target.value)} />
                    </label>
                  ) : (
                    <label className="text-xs text-gray-500">
                      Importe
                      <input className="input mt-1" type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
                    </label>
                  )}
                  <label className="text-xs text-gray-500">
                    Fecha
                    <input className="input mt-1" type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} />
                  </label>
                </div>

                <label className="block text-xs text-gray-500">
                  Descripcion
                  <input
                    className="input mt-1"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={movementKind === "adjustment" ? "Conteo, diferencia, motivo" : "Compra chica, vuelto, reposicion"}
                  />
                </label>

                <button disabled={saving || !selectedAccount} className="w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-950 disabled:opacity-50">
                  {saving ? "Guardando..." : "Guardar movimiento"}
                </button>
              </form>
            </Panel>

            <Panel title="Transferir efectivo" icon={ArrowLeftRight}>
              <form onSubmit={transferCash} className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-gray-500">
                    Desde
                    <select className="input mt-1" value={transferFromId} onChange={(event) => setTransferFromId(event.target.value)}>
                      {[...centralAccounts, ...accounts].map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-gray-500">
                    Hacia
                    <select className="input mt-1" value={transferToId} onChange={(event) => setTransferToId(event.target.value)}>
                      {[...centralAccounts, ...accounts].map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs text-gray-500">
                  Importe
                  <input className="input mt-1" type="number" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} />
                </label>
                <label className="block text-xs text-gray-500">
                  Motivo
                  <input className="input mt-1" value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Reposicion de caja chica, retiro a central" />
                </label>
                <button disabled={saving} className="w-full rounded-xl border border-blue-800 bg-blue-950/50 px-4 py-3 text-sm font-black text-blue-100 disabled:opacity-50">
                  Transferir
                </button>
              </form>
            </Panel>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900">
            <div className="flex flex-col gap-3 border-b border-gray-800 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-black text-gray-100">Movimientos</h2>
                <p className="text-xs text-gray-500">Historial filtrado por sucursal y cuenta seleccionada</p>
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar movimiento" />
              </div>
            </div>

            <div className="divide-y divide-gray-800">
              {visibleMovements.length === 0 && (
                <div className="p-6 text-sm text-gray-500">Sin movimientos para este filtro.</div>
              )}
              {visibleMovements.map((movement) => (
                <div key={movement.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {movementSign(movement.type) === "-" ? <ArrowUpCircle size={16} className="text-rose-300" /> : <ArrowDownCircle size={16} className="text-emerald-300" />}
                      <p className="truncate text-sm font-bold text-gray-100">{movement.description}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(movement.created_at).toLocaleString("es-AR")} · {movement.payment_method_name || "Caja chica"} · {movement.type}
                    </p>
                  </div>
                  <p className={`text-right text-lg font-black tabular-nums ${movementTone(movement.type)}`}>
                    {movementSign(movement.type)}{money(Number(movement.amount || 0))}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "white" | "blue" | "emerald" | "rose" }) {
  const tones = {
    white: "text-gray-100",
    blue: "text-blue-200",
    emerald: "text-emerald-200",
    rose: "text-rose-200",
  };

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-black tabular-nums md:text-xl ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-gray-400" />
        <h2 className="font-black text-gray-100">{title}</h2>
      </div>
      {children}
    </section>
  );
}
