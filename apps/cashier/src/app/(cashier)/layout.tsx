"use client";

import { CashSessionProvider } from "./context/CashSessionContext";
import CashierLayoutInner from "./CashierLayoutInner";

export default function Layout({ children }: any) {
  return (
    <CashSessionProvider>
      <CashierLayoutInner>
        {children}
      </CashierLayoutInner>
    </CashSessionProvider>
  );
}