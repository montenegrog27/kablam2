"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BadgeDollarSign,
  Banknote,
  ChevronDown,
  CreditCard,
  Landmark,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  SplitSquareHorizontal,
  Trash2,
  Wallet,
} from "lucide-react";

type Account = {
  id: string;
  name: string;
  type: string;
  balance: number;
  branch_id?: string | null;
  cash_register_id?: string | null;
};

type PaymentSplit = {
  id: string;
  accountId: string;
  amount: string;
};

type OperationType = "expense" | "purchase" | "debt_payment" | "debt_in";
type SettlementType = "instant" | "split" | "account_current";

const today = () => new Date().toISOString().split("T")[0];
const money = (value: number) => `$${Math.round(value || 0).toLocaleString("es-AR")}`;
const emptySplit = (accountId = ""): PaymentSplit => ({ id: crypto.randomUUID(), accountId, amount: "" });

const movementTypeByOperation: Record<OperationType, string> = {
  expense: "expense_out",
  purchase: "purchase_out",
  debt_payment: "debt_payment_out",
  debt_in: "debt_in",
};

export default function CentralCashPage() {
  const [tenantId, setTenantId] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [purchaseCategories, setPurchaseCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<"operate" | "adjust" | "transfer" | null>("operate");

  const [operationType, setOperationType] = useState<OperationType>("expense");
  const [settlementType, setSettlementType] = useState<SettlementType>("instant");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState("");
  const [purchaseCategoryId, setPurchaseCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [debtId, setDebtId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [splits, setSplits] = useState<PaymentSplit[]>([]);
  const [debtTitle, setDebtTitle] = useState("");
  const [debtCreditor, setDebtCreditor] = useState("");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [createDebtForRemainder, setCreateDebtForRemainder] = useState(true);

  const [adjustAccountId, setAdjustAccountId] = useState("");
  const [realBalance, setRealBalance] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [transferFromId, setTransferFromId] = useState("");
  const [transferToId, setTransferToId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferReason, setTransferReason] = useState("");

  useEffect(() => { load(); }, []);

  const centralAccounts = useMemo(
    () => accounts.filter((account) => account.type !== "petty_cash"),
    [accounts],
  );
  const pettyAccounts = useMemo(
    () => accounts.filter((account) => account.type === "petty_cash"),
    [accounts],
  );
  const totalBalance = useMemo(
    () => accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0),
    [accounts],
  );
  const activeDebtTotal = useMemo(
    () => debts
      .filter((debt) => debt.status !== "paid" && debt.status !== "cancelled")
      .reduce((sum, debt) => sum + Math.max(0, Number(debt.original_amount || 0) - Number(debt.paid_amount || 0)), 0),
    [debts],
  );
  const operationTotal = Number(amount || 0) + Number(taxAmount || 0);
  const paidTotal = settlementType === "account_current"
    ? 0
    : splits.reduce((sum, split) => sum + Number(split.amount || 0), 0);
  const pendingTotal = Math.max(0, operationTotal - paidTotal);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const openDebts = debts.filter((debt) => debt.status !== "paid" && debt.status !== "cancelled");

  const load = async () => {
    setLoading(true);
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

    await ensureDefaultAccounts(userRecord.tenant_id);
    await ensurePettyCashAccounts(userRecord.tenant_id);

    const [
      { data: accountRows },
      { data: movementRows },
      { data: categoryRows },
      { data: purchaseCategoryRows },
      { data: supplierRows },
      { data: debtRows },
    ] = await Promise.all([
      supabase
        .from("central_cash_accounts")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("is_active", true)
        .order("type")
        .order("name"),
      supabase
        .from("central_cash_movements")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("expense_categories")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("purchase_categories")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("suppliers")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("financial_debts")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id)
        .order("created_at", { ascending: false }),
    ]);

    const loadedAccounts = (accountRows || []) as Account[];
    setAccounts(loadedAccounts);
    setMovements(movementRows || []);
    setCategories(categoryRows || []);
    setPurchaseCategories(purchaseCategoryRows || []);
    setSuppliers(supplierRows || []);
    setDebts(debtRows || []);

    const firstAccount = loadedAccounts[0]?.id || "";
    if (splits.length === 0) setSplits([emptySplit(firstAccount)]);
    if (!adjustAccountId) setAdjustAccountId(firstAccount);
    if (!transferFromId) setTransferFromId(firstAccount);
    if (!transferToId && loadedAccounts[1]) setTransferToId(loadedAccounts[1].id);
    setLoading(false);
  };

  const ensureDefaultAccounts = async (tenant: string) => {
    await supabase.from("central_cash_accounts").upsert([
      { tenant_id: tenant, type: "cash", name: "Efectivo central" },
      { tenant_id: tenant, type: "transfer", name: "Transferencias / MercadoPago" },
    ], { onConflict: "tenant_id,type,name" });
  };

  const ensurePettyCashAccounts = async (tenant: string) => {
    const { data: registers } = await supabase
      .from("cash_registers")
      .select("id, name, branch_id, branches(name)")
      .eq("tenant_id", tenant)
      .eq("is_active", true)
      .order("name");

    await Promise.all((registers || []).map((register: any) =>
      supabase.rpc("ensure_petty_cash_account", {
        p_tenant_id: tenant,
        p_branch_id: register.branch_id,
        p_cash_register_id: register.id,
        p_name: `Caja chica - ${register.branches?.name || "Sucursal"} / ${register.name}`,
      }),
    ));
  };

  const resetOperation = () => {
    setDescription("");
    setAmount("");
    setTaxAmount("0");
    setDate(today());
    setCategoryId("");
    setPurchaseCategoryId("");
    setSupplierId("");
    setDebtId("");
    setReference("");
    setNotes("");
    setDebtTitle("");
    setDebtCreditor("");
    setDebtDueDate("");
    setCreateDebtForRemainder(true);
    setSplits([emptySplit(accounts[0]?.id || "")]);
  };

  const updateSplit = (id: string, key: keyof PaymentSplit, value: string) => {
    setSplits((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const createDebt = async ({
    total,
    sourceType,
    sourceId,
    fallbackTitle,
  }: {
    total: number;
    sourceType: string;
    sourceId?: string | null;
    fallbackTitle: string;
  }) => {
    if (total <= 0) return null;
    const creditor = debtCreditor.trim() || selectedSupplier?.name || "Acreedor";
    const { data, error } = await supabase.from("financial_debts").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      supplier_id: supplierId || null,
      type: supplierId ? "account_payable" : "loan",
      creditor_name: creditor,
      title: debtTitle.trim() || fallbackTitle,
      original_amount: total,
      paid_amount: 0,
      status: "open",
      source_type: sourceType,
      source_id: sourceId || null,
      due_date: debtDueDate || null,
      notes: notes || null,
      created_by: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return data;
  };

  const applyPayments = async ({
    sourceId,
    sourceType,
    movementType,
    label,
    debtIdForMovement,
  }: {
    sourceId?: string | null;
    sourceType: OperationType;
    movementType: string;
    label: string;
    debtIdForMovement?: string | null;
  }) => {
    if (settlementType === "account_current") return;

    for (const split of splits.filter((item) => Number(item.amount || 0) > 0)) {
      const account = accounts.find((item) => item.id === split.accountId);
      const splitAmount = Number(split.amount || 0);
      if (!account || splitAmount <= 0) continue;

      const { error: movementError } = await supabase.from("central_cash_movements").insert({
        tenant_id: tenantId,
        branch_id: account.branch_id || branchId,
        account_id: account.id,
        type: movementType,
        amount: splitAmount,
        description: label,
        payment_method_name: account.name,
        expense_id: sourceType === "expense" ? sourceId : null,
        purchase_id: sourceType === "purchase" ? sourceId : null,
        debt_id: debtIdForMovement || (sourceType === "debt_payment" ? sourceId : null),
        created_by: userId,
        metadata: {
          reference: reference || null,
          operation_type: sourceType,
          settlement_type: settlementType,
        },
      });
      if (movementError) throw new Error(movementError.message);

      const sign = movementType === "debt_in" || movementType === "manual_in" ? 1 : -1;
      const { error: accountError } = await supabase
        .from("central_cash_accounts")
        .update({
          balance: Number(account.balance || 0) + sign * splitAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
      if (accountError) throw new Error(accountError.message);
    }
  };

  const saveOperation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || operationTotal <= 0) return;
    if (operationType !== "debt_payment" && !description.trim()) return;
    if (operationType === "purchase" && !supplierId) {
      setMessage("Selecciona proveedor para registrar una compra.");
      return;
    }
    if (operationType === "debt_payment" && !debtId) {
      setMessage("Selecciona una deuda para registrar el pago.");
      return;
    }
    if (operationType !== "debt_in" && pendingTotal > 0 && !createDebtForRemainder && settlementType !== "account_current") {
      setMessage("El pago dividido no cubre el total. Marca crear deuda o ajusta los pagos.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      let sourceId: string | null = null;
      let generatedDebtId: string | null = null;

      if (operationType === "expense") {
        const { data, error } = await supabase.from("expenses").insert({
          tenant_id: tenantId,
          branch_id: branchId,
          description,
          amount: Number(amount || 0),
          tax_amount: Number(taxAmount || 0),
          total: operationTotal,
          category_id: categoryId || null,
          supplier_id: supplierId || null,
          expense_date: date,
          reference: reference || null,
          notes: notes || null,
          paid_from_central: paidTotal > 0,
          created_by: userId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        sourceId = data.id;
      }

      if (operationType === "purchase") {
        const { data, error } = await supabase.from("purchases").insert({
          tenant_id: tenantId,
          branch_id: branchId,
          supplier_id: supplierId,
          category_id: purchaseCategoryId || null,
          invoice_number: reference || null,
          description,
          subtotal: Number(amount || 0),
          tax_amount: Number(taxAmount || 0),
          total: operationTotal,
          status: pendingTotal > 0 ? "partial" : "completed",
          purchase_date: date,
          notes: notes || null,
          created_by: userId,
        }).select("id").single();
        if (error) throw new Error(error.message);
        sourceId = data.id;
      }

      if (operationType === "debt_payment") {
        sourceId = debtId;
      }

      if (operationType === "debt_in") {
        const debt = await createDebt({
          total: operationTotal,
          sourceType: "loan",
          sourceId: null,
          fallbackTitle: description || "Prestamo recibido",
        });
        generatedDebtId = debt?.id || null;
      }

      if (operationType !== "debt_in") {
        await applyPayments({
          sourceId,
          sourceType: operationType,
          movementType: movementTypeByOperation[operationType],
          label: description || "Pago de deuda",
          debtIdForMovement: operationType === "debt_payment" ? debtId : null,
        });
      } else {
        await applyPayments({
          sourceId: generatedDebtId,
          sourceType: operationType,
          movementType: "debt_in",
          label: description || "Dinero prestado recibido",
          debtIdForMovement: generatedDebtId,
        });
      }

      if (operationType === "debt_payment") {
        const debt = debts.find((item) => item.id === debtId);
        const nextPaid = Number(debt?.paid_amount || 0) + paidTotal;
        const original = Number(debt?.original_amount || 0);
        await supabase.from("financial_debt_payments").insert({
          tenant_id: tenantId,
          debt_id: debtId,
          amount: paidTotal,
          payment_date: date,
          notes: notes || null,
          created_by: userId,
        });
        await supabase.from("financial_debts").update({
          paid_amount: nextPaid,
          status: nextPaid >= original ? "paid" : "partial",
          updated_at: new Date().toISOString(),
        }).eq("id", debtId);
      }

      if ((operationType === "expense" || operationType === "purchase") && (settlementType === "account_current" || pendingTotal > 0)) {
        const debt = await createDebt({
          total: pendingTotal || operationTotal,
          sourceType: operationType,
          sourceId,
          fallbackTitle: operationType === "purchase"
            ? `Cuenta corriente ${selectedSupplier?.name || "proveedor"}`
            : `Saldo pendiente - ${description}`,
        });
        generatedDebtId = debt?.id || null;
      }

      setMessage(generatedDebtId ? "Operacion registrada y deuda creada" : "Operacion registrada");
      resetOperation();
      await load();
    } catch (error: any) {
      setMessage(error?.message || "No se pudo registrar la operacion.");
    } finally {
      setSaving(false);
    }
  };

  const adjustBalance = async (event: React.FormEvent) => {
    event.preventDefault();
    const account = accounts.find((item) => item.id === adjustAccountId);
    if (!tenantId || !account || realBalance === "" || !adjustReason.trim()) return;
    setSaving(true);
    setMessage("");

    const target = Number(realBalance);
    const current = Number(account.balance || 0);
    const delta = target - current;

    if (delta === 0) {
      setMessage("No hay diferencia para ajustar.");
      setSaving(false);
      return;
    }

    const { error: movementError } = await supabase.from("central_cash_movements").insert({
      tenant_id: tenantId,
      branch_id: account.branch_id || branchId,
      account_id: account.id,
      type: "adjustment",
      amount: Math.abs(delta),
      description: `Arreglado por diferencia: ${adjustReason.trim()}`,
      payment_method_name: account.name,
      created_by: userId,
      metadata: { previous_balance: current, adjusted_balance: target, delta, reason: adjustReason.trim() },
    });

    if (!movementError) {
      await supabase.from("central_cash_accounts").update({ balance: target, updated_at: new Date().toISOString() }).eq("id", account.id);
      setRealBalance("");
      setAdjustReason("");
      setMessage("Diferencia ajustada");
      await load();
    } else {
      setMessage(movementError.message);
    }
    setSaving(false);
  };

  const transferCash = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(transferAmount);
    const from = accounts.find((item) => item.id === transferFromId);
    const to = accounts.find((item) => item.id === transferToId);
    if (!tenantId || !from || !to || from.id === to.id || value <= 0 || !transferReason.trim()) return;
    setSaving(true);
    setMessage("");

    const transferId = crypto.randomUUID();
    const { error } = await supabase.from("central_cash_movements").insert([
      {
        tenant_id: tenantId,
        branch_id: from.branch_id || branchId,
        account_id: from.id,
        type: "transfer_out",
        amount: value,
        description: `Transferencia a ${to.name}: ${transferReason.trim()}`,
        payment_method_name: from.name,
        created_by: userId,
        metadata: { transfer_id: transferId, to_account_id: to.id, reason: transferReason.trim() },
      },
      {
        tenant_id: tenantId,
        branch_id: to.branch_id || branchId,
        account_id: to.id,
        type: "transfer_in",
        amount: value,
        description: `Transferencia desde ${from.name}: ${transferReason.trim()}`,
        payment_method_name: to.name,
        created_by: userId,
        metadata: { transfer_id: transferId, from_account_id: from.id, reason: transferReason.trim() },
      },
    ]);

    if (!error) {
      await Promise.all([
        supabase.from("central_cash_accounts").update({ balance: Number(from.balance || 0) - value, updated_at: new Date().toISOString() }).eq("id", from.id),
        supabase.from("central_cash_accounts").update({ balance: Number(to.balance || 0) + value, updated_at: new Date().toISOString() }).eq("id", to.id),
      ]);
      setTransferAmount("");
      setTransferReason("");
      setMessage("Transferencia registrada");
      await load();
    } else {
      setMessage(error.message);
    }
    setSaving(false);
  };

  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name || "Cuenta";

  if (loading) return <div className="text-sm text-gray-500">Cargando caja central...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="sticky top-0 z-20 -mx-4 border-b border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-gray-100 md:text-2xl">Caja Central</h1>
            <p className="text-xs text-gray-500 md:text-sm">Tesoreria, pagos, compras y deudas</p>
          </div>
          <button onClick={load} className="rounded-xl border border-gray-700 bg-gray-900 p-3 text-gray-300">
            <RefreshCw size={18} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi label="Saldo total" value={money(totalBalance)} tone="white" />
          <Kpi label="Cuentas centrales" value={money(centralAccounts.reduce((sum, item) => sum + Number(item.balance || 0), 0))} tone="emerald" />
          <Kpi label="Cajas chicas" value={money(pettyAccounts.reduce((sum, item) => sum + Number(item.balance || 0), 0))} tone="blue" />
          <Kpi label="Deuda abierta" value={money(activeDebtTotal)} tone="amber" />
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => (
          <div key={account.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-100">{account.name}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{account.type}</p>
              </div>
              {account.type === "cash" ? <Banknote size={18} className="text-emerald-300" /> : account.type === "petty_cash" ? <Wallet size={18} className="text-blue-300" /> : <CreditCard size={18} className="text-violet-300" />}
            </div>
            <p className="text-2xl font-black tabular-nums text-gray-100">{money(Number(account.balance || 0))}</p>
          </div>
        ))}
      </section>

      <Panel title="Operar caja" icon={BadgeDollarSign} open={expanded === "operate"} onToggle={() => setExpanded(expanded === "operate" ? null : "operate")}>
        <form onSubmit={saveOperation} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              ["expense", "Gasto"],
              ["purchase", "Compra"],
              ["debt_payment", "Pagar deuda"],
              ["debt_in", "Prestamo recibido"],
            ] as [OperationType, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setOperationType(value);
                  if (value === "debt_payment" || value === "debt_in") setSettlementType("split");
                }}
                className={`rounded-xl border px-3 py-3 text-sm font-bold ${operationType === value ? "border-emerald-400 bg-emerald-400 text-gray-950" : "border-gray-700 bg-gray-950 text-gray-300"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {operationType !== "debt_in" && operationType !== "debt_payment" && (
            <div className="grid grid-cols-3 gap-2">
              {([
                ["instant", "Al instante"],
                ["split", "Pago dividido"],
                ["account_current", "Cuenta corriente"],
              ] as [SettlementType, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSettlementType(value)}
                  className={`rounded-xl border px-2 py-2 text-xs font-bold md:text-sm ${settlementType === value ? "border-blue-300 bg-blue-300 text-gray-950" : "border-gray-700 bg-gray-950 text-gray-300"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {operationType === "debt_payment" ? (
              <Field label="Deuda">
                <select className="input" value={debtId} onChange={(event) => setDebtId(event.target.value)}>
                  <option value="">Seleccionar deuda</option>
                  {openDebts.map((debt) => (
                    <option key={debt.id} value={debt.id}>
                      {debt.title} - saldo {money(Number(debt.original_amount || 0) - Number(debt.paid_amount || 0))}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label={operationType === "debt_in" ? "Quien presta / origen" : "Descripcion"}>
                <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ej: cheddar, cadeteria, prestamo Polemico" />
              </Field>
            )}

            <Field label="Fecha">
              <input type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>

            <Field label="Monto">
              <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
            </Field>

            <Field label="IVA / impuesto">
              <input type="number" min="0" step="0.01" className="input" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} placeholder="0" />
            </Field>

            {(operationType === "purchase" || operationType === "expense") && (
              <Field label="Proveedor">
                <select className="input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">Sin proveedor</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </Field>
            )}

            {operationType === "expense" && (
              <Field label="Categoria de gasto">
                <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Sin categoria</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
            )}

            {operationType === "purchase" && (
              <Field label="Categoria de compra">
                <select className="input" value={purchaseCategoryId} onChange={(event) => setPurchaseCategoryId(event.target.value)}>
                  <option value="">Sin categoria</option>
                  {purchaseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </Field>
            )}

            <Field label="Referencia">
              <input className="input" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Factura, comprobante o nota" />
            </Field>
          </div>

          {settlementType !== "account_current" && (
            <div className="rounded-2xl border border-gray-800 bg-gray-950 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-100">
                  <SplitSquareHorizontal size={16} /> Medios de pago
                </div>
                <button type="button" onClick={() => setSplits((items) => [...items, emptySplit(accounts[0]?.id || "")])} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300">
                  Agregar
                </button>
              </div>
              <div className="space-y-2">
                {splits.map((split) => (
                  <div key={split.id} className="grid grid-cols-[1fr_120px_36px] gap-2">
                    <select className="input" value={split.accountId} onChange={(event) => updateSplit(split.id, "accountId", event.target.value)}>
                      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                    <input className="input" type="number" min="0" step="0.01" value={split.amount} onChange={(event) => updateSplit(split.id, "amount", event.target.value)} placeholder="Monto" />
                    <button type="button" onClick={() => setSplits((items) => items.filter((item) => item.id !== split.id))} className="rounded-lg border border-red-900/60 text-red-300">
                      <Trash2 size={14} className="mx-auto" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MiniTotal label="Total" value={operationTotal} />
                <MiniTotal label="Pagado" value={paidTotal} />
                <MiniTotal label="Pendiente" value={pendingTotal} />
              </div>
            </div>
          )}

          {(operationType === "purchase" || operationType === "expense" || operationType === "debt_in") && (pendingTotal > 0 || settlementType === "account_current" || operationType === "debt_in") && (
            <div className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-3">
              {operationType !== "debt_in" && (
                <label className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-100">
                  <input type="checkbox" checked={createDebtForRemainder} onChange={(event) => setCreateDebtForRemainder(event.target.checked)} />
                  Crear deuda por el saldo pendiente
                </label>
              )}
              <div className="grid gap-2 md:grid-cols-3">
                <input className="input" value={debtTitle} onChange={(event) => setDebtTitle(event.target.value)} placeholder="Titulo de deuda" />
                <input className="input" value={debtCreditor} onChange={(event) => setDebtCreditor(event.target.value)} placeholder="Acreedor, ej: Polemico" />
                <input type="date" className="input" value={debtDueDate} onChange={(event) => setDebtDueDate(event.target.value)} />
              </div>
            </div>
          )}

          <textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notas internas" />

          <button disabled={saving || operationTotal <= 0} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-sm font-black text-gray-950 disabled:opacity-50 md:w-auto md:py-3">
            <Save size={17} /> {saving ? "Guardando..." : "Guardar operacion"}
          </button>
          {message && <p className="text-sm text-gray-400">{message}</p>}
        </form>
      </Panel>

      <Panel title="Transferir entre cajas" icon={Landmark} open={expanded === "transfer"} onToggle={() => setExpanded(expanded === "transfer" ? null : "transfer")}>
        <form onSubmit={transferCash} className="grid gap-3 md:grid-cols-5">
          <select className="input" value={transferFromId} onChange={(event) => setTransferFromId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>Desde: {account.name}</option>)}
          </select>
          <select className="input" value={transferToId} onChange={(event) => setTransferToId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>Hacia: {account.name}</option>)}
          </select>
          <input className="input" type="number" min="0" step="0.01" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} placeholder="Monto" />
          <input className="input" value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Motivo" />
          <button disabled={saving || transferFromId === transferToId || Number(transferAmount) <= 0 || !transferReason.trim()} className="rounded-xl bg-blue-300 px-4 py-3 text-sm font-black text-gray-950 disabled:opacity-50">
            Transferir
          </button>
        </form>
      </Panel>

      <Panel title="Arreglar diferencia" icon={RefreshCw} open={expanded === "adjust"} onToggle={() => setExpanded(expanded === "adjust" ? null : "adjust")}>
        <form onSubmit={adjustBalance} className="grid gap-3 md:grid-cols-4">
          <select className="input" value={adjustAccountId} onChange={(event) => setAdjustAccountId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <input className="input" type="number" min="0" step="0.01" value={realBalance} onChange={(event) => setRealBalance(event.target.value)} placeholder="Saldo real" />
          <input className="input" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} placeholder="Motivo auditado" />
          <button disabled={saving || realBalance === "" || !adjustReason.trim()} className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-gray-950 disabled:opacity-50">
            Ajustar
          </button>
        </form>
      </Panel>

      <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3">
            <h2 className="font-bold text-gray-100">Movimientos recientes</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {movements.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">Sin movimientos</div>
            ) : movements.map((movement) => {
              const delta = Number(movement.metadata?.delta || 0);
              const isOut = ["expense_out", "purchase_out", "debt_payment_out", "manual_out", "transfer_out"].includes(movement.type) || delta < 0;
              return (
                <div key={movement.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 gap-3">
                    {isOut ? <ArrowUpCircle size={18} className="mt-0.5 flex-shrink-0 text-red-400" /> : <ArrowDownCircle size={18} className="mt-0.5 flex-shrink-0 text-emerald-400" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-100">{movement.description}</p>
                      <p className="mt-1 text-xs text-gray-500">{accountName(movement.account_id)} · {new Date(movement.created_at).toLocaleString("es-AR")}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-black tabular-nums ${isOut ? "text-red-300" : "text-emerald-300"}`}>
                    {isOut ? "-" : "+"}{money(Number(movement.amount || 0))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 px-4 py-3">
            <h2 className="font-bold text-gray-100">Deudas abiertas</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {openDebts.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">Sin deudas abiertas</div>
            ) : openDebts.slice(0, 8).map((debt) => {
              const balance = Number(debt.original_amount || 0) - Number(debt.paid_amount || 0);
              return (
                <div key={debt.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-100">{debt.title}</p>
                      <p className="mt-1 text-xs text-gray-500">{debt.creditor_name}{debt.due_date ? ` · vence ${new Date(debt.due_date).toLocaleDateString("es-AR")}` : ""}</p>
                    </div>
                    <span className="font-black text-amber-300">{money(balance)}</span>
                  </div>
                </div>
              );
            })}
          </div>
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

function Kpi({ label, value, tone }: { label: string; value: string; tone: "white" | "emerald" | "blue" | "amber" }) {
  const colors = {
    white: "text-gray-100",
    emerald: "text-emerald-300",
    blue: "text-blue-300",
    amber: "text-amber-300",
  };
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-black tabular-nums md:text-lg ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: any;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
        <span className="flex items-center gap-2 font-bold text-gray-100"><Icon size={18} className="text-gray-400" /> {title}</span>
        <ChevronDown size={18} className={`text-gray-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-gray-800 p-4">{children}</div>}
    </section>
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

function MiniTotal({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 font-black text-gray-100">{money(value)}</p>
    </div>
  );
}
