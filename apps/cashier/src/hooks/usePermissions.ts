"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export type PermissionsMap = Record<string, boolean>;

const ADMIN_PERMISSIONS: PermissionsMap = {
  "cashier.orders.view": true,
  "cashier.kds.view": true,
  "cashier.chat.view": true,
  "cashier.close_cash.view": true,
};

export function usePermissions() {
  const [perms, setPerms] = useState<PermissionsMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) { setLoading(false); return; }

      const { data: userRecord } = await supabase
        .from("users")
        .select("role, role_id, roles!left(id, name)")
        .eq("id", user.id)
        .single();

      if (["admin", "owner"].includes(userRecord?.role)) {
        setPerms(ADMIN_PERMISSIONS);
        setLoading(false);
        return;
      }

      if (!userRecord?.role_id) {
        // No role assigned = no permissions
        setPerms({});
        setLoading(false);
        return;
      }

      const { data: rolePerms } = await supabase
        .from("role_permissions")
        .select("permissions!left(key)")
        .eq("role_id", userRecord.role_id);

      const permMap: PermissionsMap = {};
      (rolePerms || []).forEach((rp: any) => {
        if (rp.permissions?.key) {
          permMap[rp.permissions.key] = true;
        }
      });
      setPerms(permMap);
    } catch (e) {
      console.error("Error loading permissions:", e);
    }
    setLoading(false);
  };

  const can = (key: string) => perms[key] === true;

  return { perms, can, loading };
}
