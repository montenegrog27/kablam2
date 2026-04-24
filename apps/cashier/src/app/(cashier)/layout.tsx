"use client";

import { CashSessionProvider } from "./context/CashSessionContext";
import { BranchProvider } from "./context/BranchContext";
import CashierLayoutInner from "./CashierLayoutInner";

export default function Layout({ children }: any) {
  return (
    <BranchProvider>
      <CashSessionProvider>
        <CashierLayoutInner>{children}</CashierLayoutInner>
      </CashSessionProvider>
    </BranchProvider>
  );
}
