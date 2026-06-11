"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Award,
  BarChart3,
  Check,
  ChevronRight,
  Flame,
  Gift,
  Pencil,
  Plus,
  Save,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

type RuleType = "points" | "product_points" | "combo_points" | "category_points" | "extra_points" | "product_accumulation";
type Tab = "levels" | "rules" | "analytics";

type LoyaltyRule = {
  id: string;
  name: string;
  type: RuleType;
  is_active: boolean;
  points_per_amount?: number | null;
  points_per_unit?: number | null;
  points_per_extra_peso?: number | null;
  minimum_amount?: number | null;
  product_id?: string | null;
  combo_id?: string | null;
  category_id?: string | null;
  required_quantity?: number | null;
  reward_type?: string | null;
  reward_value?: number | null;
  priority?: number | null;
};

type LoyaltyLevel = {
  id: string;
  name: string;
  description?: string | null;
  min_points: number;
  max_points?: number | null;
  sort_order: number;
  color?: string | null;
  is_active: boolean;
};

const defaultLevelForm = {
  name: "",
  description: "",
  min_points: "0",
  max_points: "",
  sort_order: "10",
  color: "#FF1A1A",
  is_active: true,
};

const defaultRuleForm = {
  name: "",
  type: "points" as RuleType,
  points_per_amount: "1000",
  points_per_unit: "100",
  points_per_extra_peso: "1000",
  minimum_amount: "0",
  product_id: "",
  combo_id: "",
  category_id: "",
  required_quantity: "5",
  reward_type: "free_product",
  reward_value: "",
  priority: "100",
  is_active: true,
};

export default function LoyaltyRulesPage() {
  const [tab, setTab] = useState<Tab>("levels");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [rules, setRules] = useState<LoyaltyRule[]>([]);
  const [levels, setLevels] = useState<LoyaltyLevel[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [combos, setCombos] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<LoyaltyRule | null>(null);
  const [ruleForm, setRuleForm] = useState(defaultRuleForm);

  const [showLevelForm, setShowLevelForm] = useState(false);
  const [editingLevel, setEditingLevel] = useState<LoyaltyLevel | null>(null);
  const [levelForm, setLevelForm] = useState(defaultLevelForm);

  useEffect(() => {
    loadData();
  }, []);

  const totals = useMemo(() => {
    const points = events.reduce((sum, event) => sum + Number(event.points || 0), 0);
    const customers = new Set(events.map((event) => event.customer_id).filter(Boolean)).size;
    const orders = new Set(events.map((event) => event.order_id).filter(Boolean)).size;
    return { points, customers, orders };
  }, [events]);

  const loadData = async () => {
    setLoading(true);
    setMessage("");

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);

    const [rulesRes, levelsRes, productsRes, combosRes, categoriesRes, eventsRes] = await Promise.all([
      supabase.from("loyalty_rules").select("*").eq("tenant_id", userRecord.tenant_id).order("priority", { ascending: true }),
      supabase.from("loyalty_levels").select("*").eq("tenant_id", userRecord.tenant_id).order("min_points", { ascending: true }),
      supabase.from("products").select("id, name, category_id").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("combos").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("categories").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("loyalty_point_events").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false }).limit(200),
    ]);

    if (levelsRes.error?.code === "42P01" || eventsRes.error?.code === "42P01") {
      setMessage("Falta ejecutar add_loyalty_levels_and_points.sql en Supabase para activar niveles y analytics.");
    }

    setRules((rulesRes.data || []) as LoyaltyRule[]);
    setLevels((levelsRes.data || []) as LoyaltyLevel[]);
    setProducts(productsRes.data || []);
    setCombos(combosRes.data || []);
    setCategories(categoriesRes.data || []);
    setEvents(eventsRes.data || []);
    setLoading(false);
  };

  const seedLevels = async () => {
    if (!tenantId) return;
    const { error } = await supabase.rpc("seed_default_loyalty_levels", { p_tenant_id: tenantId });
    if (error) {
      setMessage(error.code === "42883" ? "Primero ejecutá add_loyalty_levels_and_points.sql." : error.message);
      return;
    }
    setMessage("Niveles Mordisco creados.");
    loadData();
  };

  const resetRuleForm = () => {
    setRuleForm(defaultRuleForm);
    setEditingRule(null);
    setShowRuleForm(false);
  };

  const resetLevelForm = () => {
    setLevelForm(defaultLevelForm);
    setEditingLevel(null);
    setShowLevelForm(false);
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !ruleForm.name.trim()) return;

    const payload: Record<string, any> = {
      tenant_id: tenantId,
      name: ruleForm.name.trim(),
      type: ruleForm.type,
      is_active: ruleForm.is_active,
      priority: Number(ruleForm.priority || 100),
      points_per_amount: Number(ruleForm.points_per_amount || 1000),
      points_per_unit: Number(ruleForm.points_per_unit || 0),
      points_per_extra_peso: Number(ruleForm.points_per_extra_peso || ruleForm.points_per_amount || 1000),
      minimum_amount: Number(ruleForm.minimum_amount || 0),
      product_id: ruleForm.product_id || null,
      combo_id: ruleForm.combo_id || null,
      category_id: ruleForm.category_id || null,
      required_quantity: Number(ruleForm.required_quantity || 0),
      reward_type: ruleForm.reward_type || null,
      reward_value: ruleForm.reward_value ? Number(ruleForm.reward_value) : null,
      applies_to: ruleTypeScope(ruleForm.type),
    };

    const result = editingRule
      ? await supabase.from("loyalty_rules").update(payload).eq("id", editingRule.id)
      : await supabase.from("loyalty_rules").insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetRuleForm();
    loadData();
  };

  const saveLevel = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !levelForm.name.trim()) return;

    const payload = {
      tenant_id: tenantId,
      name: levelForm.name.trim(),
      description: levelForm.description.trim() || null,
      min_points: Number(levelForm.min_points || 0),
      max_points: levelForm.max_points ? Number(levelForm.max_points) : null,
      sort_order: Number(levelForm.sort_order || 0),
      color: levelForm.color || "#FF1A1A",
      is_active: levelForm.is_active,
      updated_at: new Date().toISOString(),
    };

    const result = editingLevel
      ? await supabase.from("loyalty_levels").update(payload).eq("id", editingLevel.id)
      : await supabase.from("loyalty_levels").insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    resetLevelForm();
    loadData();
  };

  const editRule = (rule: LoyaltyRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name || "",
      type: rule.type || "points",
      points_per_amount: String(rule.points_per_amount || 1000),
      points_per_unit: String(rule.points_per_unit || 100),
      points_per_extra_peso: String(rule.points_per_extra_peso || 1000),
      minimum_amount: String(rule.minimum_amount || 0),
      product_id: rule.product_id || "",
      combo_id: rule.combo_id || "",
      category_id: rule.category_id || "",
      required_quantity: String(rule.required_quantity || 5),
      reward_type: rule.reward_type || "free_product",
      reward_value: String(rule.reward_value || ""),
      priority: String(rule.priority || 100),
      is_active: rule.is_active,
    });
    setShowRuleForm(true);
  };

  const editLevel = (level: LoyaltyLevel) => {
    setEditingLevel(level);
    setLevelForm({
      name: level.name || "",
      description: level.description || "",
      min_points: String(level.min_points || 0),
      max_points: level.max_points == null ? "" : String(level.max_points),
      sort_order: String(level.sort_order || 0),
      color: level.color || "#FF1A1A",
      is_active: level.is_active,
    });
    setShowLevelForm(true);
  };

  const deleteRow = async (table: string, id: string) => {
    if (!confirm("Eliminar este registro?")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) setMessage(error.message);
    loadData();
  };

  return (
    <div className="space-y-6">
      <style jsx global>{`
        .panel {
          border: 1px solid rgb(55 65 81);
          border-radius: 1rem;
          background: rgb(17 24 39);
          padding: 1.25rem;
        }

        .input {
          width: 100%;
          border: 1px solid rgb(75 85 99);
          border-radius: 0.75rem;
          background: rgb(3 7 18);
          color: rgb(243 244 246);
          padding: 0.65rem 0.8rem;
          font-size: 0.875rem;
          outline: none;
        }

        .input::placeholder {
          color: rgb(107 114 128);
        }

        .input:focus {
          border-color: rgb(239 68 68);
        }

        .btn-primary,
        .btn-secondary {
          display: inline-flex;
          min-height: 2.5rem;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 0.75rem;
          padding: 0.55rem 1rem;
          font-size: 0.875rem;
          font-weight: 800;
          transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
        }

        .btn-primary {
          border: 1px solid rgb(220 38 38);
          background: rgb(220 38 38);
          color: white;
        }

        .btn-primary:hover {
          background: rgb(239 68 68);
          border-color: rgb(239 68 68);
        }

        .btn-secondary {
          border: 1px solid rgb(75 85 99);
          background: rgb(3 7 18);
          color: rgb(229 231 235);
        }

        .btn-secondary:hover {
          border-color: rgb(107 114 128);
          background: rgb(17 24 39);
        }
      `}</style>

      <header className="rounded-2xl border border-gray-700 bg-gray-900 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">Mordisco Burger Club</p>
            <h1 className="mt-2 text-3xl font-black text-gray-100">Fidelización</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Configurá niveles, puntos por productos, combos, categorías y extras. El motor se ejecuta cuando una orden se confirma y deja trazabilidad para analytics.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Puntos" value={totals.points.toLocaleString("es-AR")} />
            <Stat label="Clientes" value={String(totals.customers)} />
            <Stat label="Ordenes" value={String(totals.orders)} />
          </div>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {message}
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "levels"} icon={Trophy} label="Niveles" onClick={() => setTab("levels")} />
        <TabButton active={tab === "rules"} icon={Sparkles} label="Reglas de puntos" onClick={() => setTab("rules")} />
        <TabButton active={tab === "analytics"} icon={BarChart3} label="Analytics" onClick={() => setTab("analytics")} />
      </div>

      {tab === "levels" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-100">Niveles del club</h2>
              <p className="text-sm text-gray-400">Ejemplo: Mordisco, Doble Mordisco, Mordisco XL, Leyenda Mordisco.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={seedLevels} className="btn-secondary"><Flame size={16} /> Crear niveles Mordisco</button>
              <button onClick={() => { resetLevelForm(); setShowLevelForm(true); }} className="btn-primary"><Plus size={16} /> Nuevo nivel</button>
            </div>
          </div>

          {showLevelForm && (
            <form onSubmit={saveLevel} className="panel space-y-4">
              <FormHeader title={editingLevel ? "Editar nivel" : "Nuevo nivel"} onClose={resetLevelForm} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre"><input className="input" value={levelForm.name} onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })} placeholder="Mordisco XL" /></Field>
                <Field label="Descripción"><input className="input" value={levelForm.description} onChange={(e) => setLevelForm({ ...levelForm, description: e.target.value })} placeholder="Clientes frecuentes" /></Field>
                <Field label="Puntos desde"><input type="number" className="input" value={levelForm.min_points} onChange={(e) => setLevelForm({ ...levelForm, min_points: e.target.value })} /></Field>
                <Field label="Puntos hasta"><input type="number" className="input" value={levelForm.max_points} onChange={(e) => setLevelForm({ ...levelForm, max_points: e.target.value })} placeholder="Vacío para infinito" /></Field>
                <Field label="Orden"><input type="number" className="input" value={levelForm.sort_order} onChange={(e) => setLevelForm({ ...levelForm, sort_order: e.target.value })} /></Field>
                <Field label="Color"><input type="color" className="h-11 w-24 rounded-lg border border-gray-700 bg-gray-950 p-1" value={levelForm.color} onChange={(e) => setLevelForm({ ...levelForm, color: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={levelForm.is_active} onChange={(e) => setLevelForm({ ...levelForm, is_active: e.target.checked })} /> Activo</label>
              <button className="btn-primary"><Save size={16} /> Guardar nivel</button>
            </form>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {levels.map((level) => (
              <div key={level.id} className="panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: level.color || "#FF1A1A" }} />
                      <h3 className="text-lg font-black text-gray-100">{level.name}</h3>
                      {!level.is_active && <Badge>Inactivo</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-gray-400">{level.description || "Sin descripción"}</p>
                    <p className="mt-3 text-sm font-bold text-red-300">
                      {level.min_points.toLocaleString("es-AR")} - {level.max_points == null ? "∞" : level.max_points.toLocaleString("es-AR")} puntos
                    </p>
                  </div>
                  <RowActions onEdit={() => editLevel(level)} onDelete={() => deleteRow("loyalty_levels", level.id)} />
                </div>
              </div>
            ))}
            {!loading && levels.length === 0 && <Empty icon={Trophy} text="Todavía no hay niveles configurados." />}
          </div>
        </section>
      )}

      {tab === "rules" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-100">Reglas de puntos</h2>
              <p className="text-sm text-gray-400">Definí cuántos puntos suma cada compra, producto, combo, categoría o extra.</p>
            </div>
            <button onClick={() => { resetRuleForm(); setShowRuleForm(true); }} className="btn-primary"><Plus size={16} /> Nueva regla</button>
          </div>

          {showRuleForm && (
            <form onSubmit={saveRule} className="panel space-y-4">
              <FormHeader title={editingRule ? "Editar regla" : "Nueva regla"} onClose={resetRuleForm} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre"><input className="input" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="Cheese doble suma puntos" /></Field>
                <Field label="Tipo">
                  <select className="input" value={ruleForm.type} onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value as RuleType })}>
                    <option value="points">Puntos por gasto total</option>
                    <option value="product_points">Puntos por producto</option>
                    <option value="combo_points">Puntos por combo</option>
                    <option value="category_points">Puntos por categoría</option>
                    <option value="extra_points">Puntos por extras</option>
                    <option value="product_accumulation">Acumulación de productos</option>
                  </select>
                </Field>
              </div>

              {ruleForm.type === "points" && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Cada $X = 1 punto"><input type="number" className="input" value={ruleForm.points_per_amount} onChange={(e) => setRuleForm({ ...ruleForm, points_per_amount: e.target.value })} /></Field>
                  <Field label="Compra mínima"><input type="number" className="input" value={ruleForm.minimum_amount} onChange={(e) => setRuleForm({ ...ruleForm, minimum_amount: e.target.value })} /></Field>
                  <Field label="Prioridad"><input type="number" className="input" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} /></Field>
                </div>
              )}

              {ruleForm.type === "product_points" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Producto">
                    <select className="input" value={ruleForm.product_id} onChange={(e) => setRuleForm({ ...ruleForm, product_id: e.target.value })}>
                      <option value="">Cualquier producto</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Puntos por unidad"><input type="number" className="input" value={ruleForm.points_per_unit} onChange={(e) => setRuleForm({ ...ruleForm, points_per_unit: e.target.value })} /></Field>
                </div>
              )}

              {ruleForm.type === "combo_points" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Combo">
                    <select className="input" value={ruleForm.combo_id} onChange={(e) => setRuleForm({ ...ruleForm, combo_id: e.target.value })}>
                      <option value="">Cualquier combo</option>
                      {combos.map((combo) => <option key={combo.id} value={combo.id}>{combo.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Puntos por combo"><input type="number" className="input" value={ruleForm.points_per_unit} onChange={(e) => setRuleForm({ ...ruleForm, points_per_unit: e.target.value })} /></Field>
                </div>
              )}

              {ruleForm.type === "category_points" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Categoría">
                    <select className="input" value={ruleForm.category_id} onChange={(e) => setRuleForm({ ...ruleForm, category_id: e.target.value })}>
                      <option value="">Seleccionar categoría</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Puntos por unidad"><input type="number" className="input" value={ruleForm.points_per_unit} onChange={(e) => setRuleForm({ ...ruleForm, points_per_unit: e.target.value })} /></Field>
                </div>
              )}

              {ruleForm.type === "extra_points" && (
                <Field label="Cada $X en extras = 1 punto">
                  <input type="number" className="input max-w-xs" value={ruleForm.points_per_extra_peso} onChange={(e) => setRuleForm({ ...ruleForm, points_per_extra_peso: e.target.value })} />
                </Field>
              )}

              {ruleForm.type === "product_accumulation" && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Producto">
                    <select className="input" value={ruleForm.product_id} onChange={(e) => setRuleForm({ ...ruleForm, product_id: e.target.value })}>
                      <option value="">Cualquier producto</option>
                      {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Cantidad requerida"><input type="number" className="input" value={ruleForm.required_quantity} onChange={(e) => setRuleForm({ ...ruleForm, required_quantity: e.target.value })} /></Field>
                  <Field label="Recompensa">
                    <select className="input" value={ruleForm.reward_type} onChange={(e) => setRuleForm({ ...ruleForm, reward_type: e.target.value })}>
                      <option value="free_product">Producto gratis</option>
                      <option value="discount_percent">% descuento</option>
                      <option value="discount_amount">$ descuento</option>
                    </select>
                  </Field>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })} /> Activa</label>
              <button className="btn-primary"><Save size={16} /> Guardar regla</button>
            </form>
          )}

          <div className="grid gap-3">
            {rules.map((rule) => (
              <div key={rule.id} className="panel">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-950 text-red-300">
                      {rule.type === "combo_points" ? <Gift size={20} /> : rule.type === "points" ? <Award size={20} /> : <ShoppingBag size={20} />}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-gray-100">{rule.name}</h3>
                        {!rule.is_active && <Badge>Inactiva</Badge>}
                        <Badge>{ruleLabel(rule)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-400">{ruleDescription(rule, products, combos, categories)}</p>
                    </div>
                  </div>
                  <RowActions onEdit={() => editRule(rule)} onDelete={() => deleteRow("loyalty_rules", rule.id)} />
                </div>
              </div>
            ))}
            {!loading && rules.length === 0 && <Empty icon={Sparkles} text="Todavía no hay reglas configuradas." />}
          </div>
        </section>
      )}

      {tab === "analytics" && (
        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="panel">
            <h2 className="mb-4 text-xl font-black text-gray-100">Últimos puntos otorgados</h2>
            <div className="divide-y divide-gray-800">
              {events.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-bold text-gray-100">{event.description || event.source}</p>
                    <p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString("es-AR")}</p>
                  </div>
                  <span className="text-lg font-black text-red-300">+{event.points}</span>
                </div>
              ))}
              {events.length === 0 && <Empty icon={BarChart3} text="Sin eventos de puntos todavía." />}
            </div>
          </div>

          <div className="panel">
            <h3 className="text-lg font-black text-gray-100">Cómo funciona</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-gray-400">
              <p>1. El pedido se crea en customer o cashier.</p>
              <p>2. Cuando pasa a confirmado, se ejecuta el motor de fidelización.</p>
              <p>3. Se suman puntos por gasto, productos, combos, categorías y extras.</p>
              <p>4. El perfil del cliente calcula su nivel según la tabla de niveles activa.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ruleTypeScope(type: RuleType) {
  if (type === "product_points" || type === "product_accumulation") return "product";
  if (type === "combo_points") return "combo";
  if (type === "category_points") return "category";
  if (type === "extra_points") return "extra";
  return "order";
}

function ruleLabel(rule: LoyaltyRule) {
  const labels: Record<RuleType, string> = {
    points: "Gasto",
    product_points: "Producto",
    combo_points: "Combo",
    category_points: "Categoría",
    extra_points: "Extras",
    product_accumulation: "Acumulación",
  };
  return labels[rule.type] || rule.type;
}

function ruleDescription(rule: LoyaltyRule, products: any[], combos: any[], categories: any[]) {
  if (rule.type === "points") return `Cada $${Number(rule.points_per_amount || 1000).toLocaleString("es-AR")} suma 1 punto.`;
  if (rule.type === "product_points") return `${Number(rule.points_per_unit || 0)} puntos por ${findName(products, rule.product_id) || "cada producto"}.`;
  if (rule.type === "combo_points") return `${Number(rule.points_per_unit || 0)} puntos por ${findName(combos, rule.combo_id) || "cada combo"}.`;
  if (rule.type === "category_points") return `${Number(rule.points_per_unit || 0)} puntos por unidad en ${findName(categories, rule.category_id) || "categoría"}.`;
  if (rule.type === "extra_points") return `Cada $${Number(rule.points_per_extra_peso || 1000).toLocaleString("es-AR")} en extras suma 1 punto.`;
  return `${rule.required_quantity || 0} compras para liberar recompensa.`;
}

function findName(rows: any[], id?: string | null) {
  return rows.find((row) => row.id === id)?.name;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-950 px-4 py-3">
      <p className="text-lg font-black text-gray-100">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${active ? "border-red-500 bg-red-600 text-white" : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600"}`}>
      <Icon size={16} />
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function FormHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-lg font-black text-gray-100">{title}</h3>
      <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-100">
        <X size={18} />
      </button>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button onClick={onEdit} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-gray-100"><Pencil size={15} /></button>
      <button onClick={onDelete} className="rounded-lg p-2 text-gray-400 hover:bg-red-950 hover:text-red-300"><Trash2 size={15} /></button>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">{children}</span>;
}

function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900 p-8 text-center text-gray-500">
      <Icon size={32} className="mx-auto mb-2 opacity-60" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
