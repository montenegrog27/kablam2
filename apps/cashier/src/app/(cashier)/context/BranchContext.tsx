"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

const BranchContext = createContext<any>(null);

export function BranchProvider({ children }: any) {
  const [currentBranch, setCurrentBranch] = useState<any>(null);
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [userRecord, setUserRecord] = useState<any>(null);

  const init = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUser = sessionData.session?.user;
    if (!authUser) return;

    const { data: userData } = await supabase
      .from("users")
      .select("*, tenants(*)")
      .eq("id", authUser.id)
      .single();

    if (!userData) return;

    setUserRecord(userData);

    let branches = [];

    if (["owner", "admin"].includes(userData.role)) {
      const { data } = await supabase
        .from("branches")
        .select("*")
        .eq("tenant_id", userData.tenant_id)
        .order("name");
      branches = data || [];
    } else {
      const { data } = await supabase
        .from("branches")
        .select("*")
        .eq("id", userData.branch_id)
        .single();
      branches = data ? [data] : [];
    }

    setAllBranches(branches);

    const savedBranchId = localStorage.getItem("selected_branch_id");
    const branchToSelect =
      branches.find((b: any) => b.id === savedBranchId) ||
      branches.find((b: any) => b.id === userData.branch_id) ||
      branches[0];

    if (branchToSelect) {
      setCurrentBranch(branchToSelect);
    }
  };

  const changeBranch = (branch: any) => {
    setCurrentBranch(branch);
    localStorage.setItem("selected_branch_id", branch.id);
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <BranchContext.Provider
      value={{
        currentBranch,
        allBranches,
        userRecord,
        changeBranch,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  return useContext(BranchContext);
}

export function useCurrentBranch() {
  const { currentBranch, userRecord, allBranches, changeBranch } = useBranch();

  return {
    branchId: currentBranch?.id,
    branch: currentBranch,
    tenantId: userRecord?.tenant_id,
    userRecord,
    allBranches,
    changeBranch,
  };
}
