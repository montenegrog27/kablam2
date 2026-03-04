"use client";

import { createContext, useContext, useState } from "react";

const CashSessionContext = createContext<any>(null);

export function CashSessionProvider({ children }: any) {
  const [cashSession, setCashSession] = useState<any>(null);

  return (
    <CashSessionContext.Provider value={{ cashSession, setCashSession }}>
      {children}
    </CashSessionContext.Provider>
  );
}

export function useCashSession() {
  return useContext(CashSessionContext);
}