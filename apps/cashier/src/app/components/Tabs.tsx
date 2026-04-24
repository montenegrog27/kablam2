// "use client";

// import { useState } from "react";
// import SalesTab from "./SalesTab";
// import DeliveredTab from "./DeliveredTab";
// import CloseCash from "./CloseCash";

// export default function CashierTabs({ session }: any) {
//   const [tab, setTab] = useState("orders");
// const [showCloseModal, setShowCloseModal] = useState(false);
//   const tabs = [
//     { id: "orders", label: "Pedidos" },
//     { id: "delivered", label: "Entregados" },
//     { id: "whatsapp", label: "WhatsApp" },
//     { id: "arqueos", label: "Arqueos" },
//   ];

//   return (
//     <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950 transition-colors">

//       {/* HEADER */}
//  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex justify-between items-center">

//   <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
//     {tabs.map((t) => (
//       <button
//         key={t.id}
//         onClick={() => setTab(t.id)}
//         className={`
//           px-4 py-2 text-sm rounded-lg transition-all duration-200
//           ${
//             tab === t.id
//               ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
//               : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
//           }
//         `}
//       >
//         {t.label}
//       </button>
//     ))}
//   </div>

//   {/* BOTÓN CIERRE */}
//   <button
//     onClick={() => setShowCloseModal(true)}
//     className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-semibold transition"
//   >
//     Hacer Cierre
//   </button>

// </div>

//       {/* CONTENT */}
//       <div className="flex-1 overflow-hidden">
//         {tab === "orders" && <SalesTab session={session} />}
//         {tab === "delivered" && <DeliveredTab session={session} />}

//         {tab === "whatsapp" && (
//           <div className="h-full flex items-center justify-center text-gray-400">
//             Próximamente WhatsApp
//           </div>
//         )}

//         {tab === "arqueos" && (
//           <div className="h-full flex items-center justify-center text-gray-400">
//             Próximamente Arqueos
//           </div>
//         )}
//       </div>
// {showCloseModal && (
//   <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
//     <div className="bg-gray-900 rounded-xl w-[700px] max-h-[90vh] overflow-y-auto">
//       <CloseCash
//         session={session}
//         onClosed={() => {
//           setShowCloseModal(false);
//           window.location.reload();
//         }}
//       />
//     </div>
//   </div>
// )}
//     </div>
//   );
// }

"use client";

import { useState } from "react";
import SalesTab from "./SalesTab";
import DeliveredTab from "./DeliveredTab";
import KDSTab from "./KDSTab";
import CloseCash from "./CloseCash";
import { useBranch } from "../(cashier)/context/BranchContext";
import { MapPin } from "lucide-react";

export default function CashierTabs({ session }: any) {
  const [tab, setTab] = useState("orders");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const { currentBranch, allBranches, changeBranch } = useBranch();

  const tabs = [
    { id: "orders", label: "Pedidos" },
    { id: "kds", label: "Cocina" },
    { id: "delivered", label: "Entregados" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "arqueos", label: "Arqueos" },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950 transition-colors">
      {/* HEADER */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex justify-between items-center">
        {/* SELECTOR DE SUCURSAL */}
        <div className="relative">
          <button
            onClick={() => setShowBranchSelector(!showBranchSelector)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <MapPin size={16} className="text-gray-600 dark:text-gray-400" />
            <span className="font-medium text-sm">
              {currentBranch?.name || "Seleccionar Sucursal"}
            </span>
          </button>

          {showBranchSelector && (
            <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border z-50 min-w-48">
              {allBranches.map((branch: any) => (
                <button
                  key={branch.id}
                  onClick={() => {
                    changeBranch(branch);
                    setShowBranchSelector(false);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                    currentBranch?.id === branch.id
                      ? "bg-gray-100 dark:bg-gray-700 font-semibold"
                      : ""
                  }`}
                >
                  {branch.name}
                </button>
              ))}
            </div>
          )}
        </div>

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

        {/* BOTÓN CIERRE */}
        <button
          onClick={() => setShowCloseModal(true)}
          className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-semibold transition"
        >
          Hacer Cierre
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden">
        {tab === "orders" && <SalesTab session={session} />}

        {tab === "kds" && <KDSTab />}

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

      {/* MODAL CIERRE */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl w-[700px] max-h-[90vh] overflow-y-auto">
            <CloseCash
              session={session}
              onClosed={() => {
                setShowCloseModal(false);
                window.location.reload();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
