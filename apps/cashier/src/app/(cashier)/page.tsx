"use client";

import { useCashSession } from "./context/CashSessionContext";
import CashierTabs from "../components/Tabs";

export default function CashierPage() {
  const { cashSession } = useCashSession();

  return <CashierTabs session={cashSession} />;
}
