"use client";

import { useState } from "react";
import SalesTab from "./SalesTab";
import DeliveredTab from "./DeliveredTab";

export default function CashierTabs({ session }: any) {
  const [tab, setTab] = useState("orders");

  const tabs = [
    { id: "orders", label: "Pedidos" },
    { id: "delivered", label: "Entregados" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "arqueos", label: "Arqueos" },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950 transition-colors">

      {/* HEADER */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">

        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">

          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`
                px-4 py-2 text-sm rounded-lg transition-all duration-200
                ${
                  tab === t.id
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }
              `}
            >
              {t.label}
            </button>
          ))}

        </div>

      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden">
        {tab === "orders" && <SalesTab session={session} />}
        {tab === "delivered" && <DeliveredTab session={session} />}

        {tab === "whatsapp" && (
          <div className="h-full flex items-center justify-center text-gray-400">
            Próximamente WhatsApp
          </div>
        )}

        {tab === "arqueos" && (
          <div className="h-full flex items-center justify-center text-gray-400">
            Próximamente Arqueos
          </div>
        )}
      </div>

    </div>
  );
}