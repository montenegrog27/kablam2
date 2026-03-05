"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");

  const [requiresPhone, setRequiresPhone] = useState(false);
  const [allowedPhone, setAllowedPhone] = useState("");

  const [hasExpiration, setHasExpiration] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  const [usageType, setUsageType] = useState("unlimited");
  const [usageLimit, setUsageLimit] = useState("");
  const [weeklyLimit, setWeeklyLimit] = useState("");

  const [isAccumulable, setIsAccumulable] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    setTenantId(userRecord.tenant_id);

    const { data } = await supabase
      .from("coupons")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("created_at", { ascending: false });

    setCoupons(data || []);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();

    if (!tenantId || !name || !code) {
      alert("Completa los campos obligatorios");
      return;
    }

    const { error } = await supabase.from("coupons").insert({
      tenant_id: tenantId,
      name,
      code: code.toUpperCase(),

      discount_type: discountType,
      discount_value:
        discountType === "percentage" ||
        discountType === "fixed"
          ? Number(discountValue)
          : null,

      requires_phone: requiresPhone,
      allowed_phone:
        requiresPhone && allowedPhone
          ? allowedPhone
          : null,

      has_expiration: hasExpiration,
      expires_at: hasExpiration ? expiresAt : null,

      usage_type: usageType,
      usage_limit:
        usageType === "limited"
          ? Number(usageLimit)
          : null,
      weekly_limit:
        usageType === "weekly_limited"
          ? Number(weeklyLimit)
          : null,

      is_accumulable: isAccumulable,
    });

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setCode("");
    setDiscountValue("");
    setRequiresPhone(false);
    setAllowedPhone("");
    setHasExpiration(false);
    setExpiresAt("");
    setUsageType("unlimited");
    setUsageLimit("");
    setWeeklyLimit("");
    setIsAccumulable(false);

    loadData();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase
      .from("coupons")
      .update({ is_active: !current })
      .eq("id", id);

    loadData();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Cupones</h1>

      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre interno"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          className="border p-2 w-full"
          placeholder="Código (Ej: VERANO10)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />

        <select
          className="border p-2 w-full"
          value={discountType}
          onChange={(e) =>
            setDiscountType(e.target.value)
          }
        >
          <option value="percentage">% Descuento</option>
          <option value="fixed">$ Monto fijo</option>
          <option value="free_shipping">Envío gratis</option>
        </select>

        {(discountType === "percentage" ||
          discountType === "fixed") && (
          <input
            type="number"
            className="border p-2 w-full"
            placeholder="Valor"
            value={discountValue}
            onChange={(e) =>
              setDiscountValue(e.target.value)
            }
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={requiresPhone}
            onChange={(e) =>
              setRequiresPhone(e.target.checked)
            }
          />
          Requiere teléfono específico
        </label>

        {requiresPhone && (
          <input
            className="border p-2 w-full"
            placeholder="Número permitido"
            value={allowedPhone}
            onChange={(e) =>
              setAllowedPhone(e.target.value)
            }
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={hasExpiration}
            onChange={(e) =>
              setHasExpiration(e.target.checked)
            }
          />
          Tiene fecha de expiración
        </label>

        {hasExpiration && (
          <input
            type="datetime-local"
            className="border p-2 w-full"
            value={expiresAt}
            onChange={(e) =>
              setExpiresAt(e.target.value)
            }
          />
        )}

        <select
          className="border p-2 w-full"
          value={usageType}
          onChange={(e) =>
            setUsageType(e.target.value)
          }
        >
          <option value="unlimited">Uso ilimitado</option>
          <option value="one_time">Una sola vez</option>
          <option value="limited">Límite total</option>
          <option value="weekly_limited">
            Límite semanal
          </option>
        </select>

        {usageType === "limited" && (
          <input
            type="number"
            className="border p-2 w-full"
            placeholder="Cantidad máxima de usos"
            value={usageLimit}
            onChange={(e) =>
              setUsageLimit(e.target.value)
            }
          />
        )}

        {usageType === "weekly_limited" && (
          <input
            type="number"
            className="border p-2 w-full"
            placeholder="Usos permitidos por semana"
            value={weeklyLimit}
            onChange={(e) =>
              setWeeklyLimit(e.target.value)
            }
          />
        )}

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isAccumulable}
            onChange={(e) =>
              setIsAccumulable(e.target.checked)
            }
          />
          Se puede combinar con descuentos del día
        </label>

        <button className="bg-white text-black px-4 py-2 rounded">
          Crear Cupón
        </button>
      </form>

      <div className="space-y-4">
        {coupons.map((coupon) => (
          <div
            key={coupon.id}
            className="bg-gray-800 p-4 rounded flex justify-between"
          >
            <div>
              <div className="font-semibold">
                {coupon.name}
              </div>
              <div className="text-xs text-gray-400">
                {coupon.code} • {coupon.discount_type}
              </div>
            </div>

            <button
              onClick={() =>
                toggleActive(coupon.id, coupon.is_active)
              }
              className="text-xs underline"
            >
              {coupon.is_active
                ? "Desactivar"
                : "Activar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}