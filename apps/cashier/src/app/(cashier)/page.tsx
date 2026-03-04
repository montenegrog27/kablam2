"use client";

import { useCashSession } from "./context/CashSessionContext";
import CashierTabs from "../components/Tabs";

export default function CashierPage() {
  const { cashSession } = useCashSession();

  if (!cashSession) {
    return (
      <div className="h-screen flex items-center justify-center">
        No hay sesión activa
      </div>
    );
  }

  return <CashierTabs session={cashSession} />;
}