"use client";

import { useState } from "react";
// import OrdersTab from "./OrdersTab";
// import WhatsappTab from "./WhatsappTab";
import SalesTab from "./SalesTab";
// import CashSessionsTab from "./CashSessionsTab";

export default function CashierTabs({ session }: any) {
  const [tab, setTab] = useState("sales");

  return (
    <div className="h-screen flex flex-col">
      <div className="flex gap-4 bg-black p-4">
        <button onClick={() => setTab("sales")}>Ventas</button>
        <button onClick={() => setTab("whatsapp")}>WhatsApp</button>
        <button onClick={() => setTab("cash")}>Arqueos</button>
      </div>

      <div className="flex-1 p-4">
          {tab === "sales" && <SalesTab session={session} />}
        {/* {tab === "orders" && <OrdersTab />}
        {tab === "whatsapp" && <WhatsappTab />} */}
        {/* {tab === "cash" && <CashSessionsTab session={session} />} */}
      </div>
    </div>
  );
}