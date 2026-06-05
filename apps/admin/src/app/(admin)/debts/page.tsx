"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Banknote, CheckCircle2, Plus, Receipt, Search, Wallet } from "lucide-react";

type Debt = {
  id: string;
  title: string;
  creditor_name: string;
  supplier_id?: string | null;
  type: string;
  original_amount: number;
  paid_amount: number;
  status: string;
  due_date?: string | null;
  notes?: string | null;
  created_at: string;
};

const today = () => new Date().toISOString().split("T")[0];
const money = (value: number) => `$${Math.round(value || 0).toLocaleString("es-AR")}`;

export default function DebtsPage() {
  const [tenantId, setTenantId] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [debts, setDebts] = useState<Debt[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [creditorName, setCreditorName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [type, setType] = useState("account_payable");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const [payDebtId, setPayDebtId] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(today());
  const [payNotes, setPayNotes] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) return;
    setUserId(authUser.id);

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", authUser.id)
      .single();
    if (!userRecord?.tenant_id) return;
    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id || null);

    const [{ data: debtRows }, { data: supplierRows }, { data: accountRows }, { data: paymentRows }] = await Promise.all([
      supabase.from("financial_debts").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
      supabase.from("central_cash_accounts").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
      supabase.from("financial_debt_payments").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false }).limit(80),
    ]);

    setDebts((debtRows || []) as Debt[]);
    setSuppliers(supplierRows || []);
    setAccounts(accountRows || []);
    setPayments(paymentRows || []);
    if (!payAccountId && accountRows?.[0]) setPayAccountId(accountRows[0].id);
  };

  const totals = useMemo(() => {
    const open = debts.filter((debt) => debt.status !== "paid" && debt.status !== "cancelled");
    const openBalance = open.reduce((sum, debt) => sum + Math.max(0, Number(debt.original_amount || 0) - Number(debt.paid_amount || 0)), 0);
    const overdue = open
      .filter((debt) => debt.due_date && debt.due_date < today())
      .reduce((sum, debt) => sum + Math.max(0, Number(debt.original_amount || 0) - Number(debt.paid_amount || 0)), 0);
    return { openCount: open.length, openBalance, overdue };
  }, [debts]);

  const filtered = debts.filter((debt) => {
    const matchesStatus = status === "all" || debt.status === status || (status === "open" && debt.status === "partial");
    const text = `${debt.title} ${debt.creditor_name}`.toLowerCase();
    return matchesStatus && text.includes(query.toLowerCase());
  });

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  const resetForm = () => {
    setTitle("");
    setCreditorName("");
    setSupplierId("");
    setType("account_payable");
    setAmount("");
    setDueDate("");
    setNotes("");
    setShowForm(false);
  };

  const createDebt = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !title.trim() || Number(amount) <= 0) return;
    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("financial_debts").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      supplier_id: supplierId || null,
      type,
      creditor_name: creditorName.trim() || selectedSupplier?.name || "Acreedor",
      title: title.trim(),
      original_amount: Number(amount),
      paid_amount: 0,
      status: "open",
      due_date: dueDate || null,
      notes: notes || null,
      created_by: userId,
    });

    setSaving(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Deuda creada");
      resetForm();
      await load();
    }
  };

  const payDebt = async (event: React.FormEvent) => {
    event.preventDefault();
    const debt = debts.find((item) => item.id === payDebtId);
    const account = accounts.find((item) => item.id === payAccountId);
    const value = Number(payAmount || 0);
    if (!tenantId || !debt || !account || value <= 0) return;
    setSaving(true);
    setMessage("");

    const { data: movement, error: movementError } = await supabase.from("central_cash_movements").insert({
      tenant_id: tenantId,
      branch_id: account.branch_id || branchId,
      account_id: account.id,
      debt_id: debt.id,
      type: "debt_payment_out",
      amount: value,
      description: `Pago deuda - ${debt.title}`,
      payment_method_name: account.name,
      created_by: userId,
      metadata: { creditor_name: debt.creditor_name, notes: payNotes || null },
    }).select("id").single();

    if (movementError) {
      setMessage(movementError.message);
      setSaving(false);
      return;
    }

    const { error: paymentError } = await supabase.from("financial_debt_payments").insert({
      tenant_id: tenantId,
      debt_id: debt.id,
      account_id: account.id,
      amount: value,
      payment_date: payDate,
      notes: payNotes || null,
      central_cash_movement_id: movement?.id || null,
      created_by: userId,
    });

    const nextPaid = Number(debt.paid_amount || 0) + value;
    const original = Number(debt.original_amount || 0);
    const [{ error: debtError }, { error: accountError }] = await Promise.all([
      supabase.from("financial_debts").update({
        paid_amount: nextPaid,
        status: nextPaid >= original ? "paid" : "partial",
        updated_at: new Date().toISOString(),
      }).eq("id", debt.id),
      supabase.from("central_cash_accounts").update({
        balance: Number(account.balance || 0) - value,
        updated_at: new Date().toISOString(),
      }).eq("id", account.id),
    ]);

    setSaving(false);
    if (paymentError || debtError || accountError) {
      setMessage(paymentError?.message || debtError?.message || accountError?.message || "No se pudo registrar el pago.");
      return;
    }

    setPayDebtId("");
    setPayAmount("");
    setPayNotes("");
    setMessage("Pago registrado");
    await load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-100">Deudas</h1>
          <p className="mt-1 text-sm text-gray-500">Prestamos, cuentas corrientes y saldos pendientes con proveedores.</p>
        </div>
        <button onClick={() => setShowForm((value) => !value)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-950">
          <Plus size={16} /> Nueva deuda
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Abiertas" value={String(totals.openCount)} />
        <Kpi label="Saldo abierto" value={money(totals.openBalance)} />
        <Kpi label="Vencido" value={money(totals.overdue)} />
      </div>

      {showForm && (
        <form onSubmit={createDebt} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Receipt size={18} className="text-gray-400" />
            <h2 className="font-bold text-gray-100">Crear deuda</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Titulo"><input className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Cheddar semana 1" /></Field>
            <Field label="Tipo">
              <select className="input" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="account_payable">Cuenta corriente</option>
                <option value="supplier_credit">Credito proveedor</option>
                <option value="loan">Prestamo</option>
                <option value="manual">Manual</option>
              </select>
            </Field>
            <Field label="Monto"><input type="number" min="0" step="0.01" className="input" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
            <Field label="Proveedor">
              <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">Sin proveedor</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </select>
            </Field>
            <Field label="Acreedor"><input className="input" value={creditorName} onChange={(event) => setCreditorName(event.target.value)} placeholder="Ej: Polemico" /></Field>
            <Field label="Vencimiento"><input type="date" className="input" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
            <Field label="Notas"><textarea className="input min-h-20 md:col-span-3" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={saving || !title.trim() || Number(amount) <= 0} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-gray-950 disabled:opacity-50">
              Guardar deuda
            </button>
            <button type="button" onClick={resetForm} className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-300">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <form onSubmit={payDebt} className="rounded-2xl border border-emerald-800/50 bg-emerald-950/10 p-4">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <h2 className="font-bold text-gray-100">Registrar pago de deuda</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Deuda">
            <select className="input" value={payDebtId} onChange={(event) => setPayDebtId(event.target.value)}>
              <option value="">Seleccionar deuda</option>
              {debts.filter((debt) => debt.status !== "paid" && debt.status !== "cancelled").map((debt) => (
                <option key={debt.id} value={debt.id}>{debt.title} - {money(Number(debt.original_amount || 0) - Number(debt.paid_amount || 0))}</option>
              ))}
            </select>
          </Field>
          <Field label="Cuenta">
            <select className="input" value={payAccountId} onChange={(event) => setPayAccountId(event.target.value)}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </Field>
          <Field label="Monto"><input type="number" min="0" step="0.01" className="input" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} /></Field>
          <Field label="Fecha"><input type="date" className="input" value={payDate} onChange={(event) => setPayDate(event.target.value)} /></Field>
          <Field label="Nota"><input className="input" value={payNotes} onChange={(event) => setPayNotes(event.target.value)} /></Field>
        </div>
        <button disabled={saving || !payDebtId || !payAccountId || Number(payAmount) <= 0} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-3 text-sm font-black text-gray-950 disabled:opacity-50 md:w-auto">
          <Wallet size={16} /> Pagar deuda
        </button>
      </form>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar deuda..." />
        </div>
        <select className="input md:w-48" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="open">Abiertas</option>
          <option value="partial">Parciales</option>
          <option value="paid">Pagadas</option>
          <option value="all">Todas</option>
        </select>
      </div>

      {message && <p className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300">{message}</p>}

      <section className="grid gap-3 lg:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-12 text-center text-sm text-gray-500 lg:col-span-2">No hay deudas para mostrar</div>
        ) : filtered.map((debt) => {
          const balance = Math.max(0, Number(debt.original_amount || 0) - Number(debt.paid_amount || 0));
          const pct = Number(debt.original_amount || 0) > 0 ? Math.min(100, (Number(debt.paid_amount || 0) / Number(debt.original_amount || 0)) * 100) : 0;
          return (
            <article key={debt.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-gray-100">{debt.title}</p>
                  <p className="mt-1 text-sm text-gray-500">{debt.creditor_name}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${debt.status === "paid" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                  {debt.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Mini label="Original" value={money(Number(debt.original_amount || 0))} />
                <Mini label="Pagado" value={money(Number(debt.paid_amount || 0))} />
                <Mini label="Saldo" value={money(balance)} />
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-800">
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                <span>{debt.due_date ? `Vence ${new Date(debt.due_date).toLocaleDateString("es-AR")}` : "Sin vencimiento"}</span>
                <button onClick={() => { setPayDebtId(debt.id); setPayAmount(String(balance)); }} className="font-bold text-emerald-300">Pagar</button>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="font-bold text-gray-100">Pagos recientes</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {payments.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">Sin pagos registrados</div>
          ) : payments.slice(0, 10).map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <Banknote size={16} className="text-emerald-300" />
                <div>
                  <p className="text-sm font-bold text-gray-100">{money(Number(payment.amount || 0))}</p>
                  <p className="text-xs text-gray-500">{new Date(payment.payment_date).toLocaleDateString("es-AR")}</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">{payment.notes || "Pago de deuda"}</span>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(55 65 81);
          background: rgb(3 7 18);
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
          color: rgb(243 244 246);
          outline: none;
        }

        .input::placeholder {
          color: rgb(107 114 128);
        }

        .input:focus {
          border-color: rgb(156 163 175);
          box-shadow: 0 0 0 1px rgb(156 163 175 / 0.35);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-black text-gray-100">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-black text-gray-100">{value}</p>
    </div>
  );
}
