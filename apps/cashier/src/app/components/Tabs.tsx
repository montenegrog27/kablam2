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

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import SalesTab from "./SalesTab";
import DeliveredTab from "./DeliveredTab";
import KDSTab from "./KDSTab";
import MesasTab from "./MesasTab";
import CloseCash from "./CloseCash";
import CashClosuresTab from "./CashClosuresTab";
import CustomerChatList from "./CustomerChatList";
import { useBranch } from "../(cashier)/context/BranchContext";
import { usePermissions } from "../../hooks/usePermissions";
import { LogOut, MapPin, Settings, X, Check } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CashierTabs({ session }: any) {
  const router = useRouter();
  const [tab, setTab] = useState("orders");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const [waUnread, setWaUnread] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [riders, setRiders] = useState<any[]>([]);
  const [savingRiders, setSavingRiders] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const { currentBranch, allBranches, changeBranch } = useBranch();
  const { can, loading: permissionsLoading } = usePermissions();
  const isOwnerMode = userRole === "owner" && !session;

  const allTabs = [
    { id: "orders", label: "Pedidos", perm: "cashier.orders.view" },
    { id: "mesas", label: "Mesas", perm: "cashier.orders.view" },
    { id: "kds", label: "Cocina", perm: "cashier.kds.view" },
    { id: "delivered", label: "Entregados", perm: "cashier.orders.view" },
    { id: "whatsapp", label: "WhatsApp", perm: "cashier.chat.view" },
    { id: "arqueos", label: "Arqueos", perm: "cashier.close_cash.view" },
  ];
  const tabs = allTabs.filter((t) => can(t.perm));

  useEffect(() => {
    if (permissionsLoading) return;
    if (tabs.length === 0) return;
    if (!tabs.some((item) => item.id === tab)) {
      setTab(tabs[0].id);
    }
  }, [permissionsLoading, tabs, tab]);

  useEffect(() => {
    const loadUserRole = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) return;

      const { data } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      setUserRole(data?.role || null);
    };

    loadUserRole();
  }, []);

  const loadRiders = async () => {
    if (!currentBranch?.id) return;
    const { data } = await supabase.from("riders").select("*").eq("branch_id", currentBranch.id).eq("is_active", true).order("name");
    setRiders(data || []);
  };

  const toggleRiderWorking = async (riderId: string, current: boolean) => {
    setRiders((prev) => prev.map((r) => r.id === riderId ? { ...r, is_working_today: !current } : r));
    await supabase.from("riders").update({ is_working_today: !current }).eq("id", riderId);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

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

        {/* SETTINGS */}
        <div className="relative">
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition">
            <Settings size={18} className="text-gray-600 dark:text-gray-400" />
          </button>
          {showSettings && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl border z-50 min-w-40 py-1">
              <button onClick={() => { setShowSettings(false); loadRiders(); setShowRiderModal(true); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition">Riders</button>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <LogOut size={15} />
                Cerrar sesion
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                if (t.id !== "whatsapp") setWaUnread(0);
              }}
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
              {t.id === "whatsapp" && waUnread > 0 && (
                <span className="ml-1.5 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] inline-flex items-center justify-center">
                  {waUnread > 99 ? "99+" : waUnread}
                </span>
              )}
            </button>
          ))}
        </div>
        {isOwnerMode && (
          <div className="rounded-lg border border-red-500 bg-red-600 px-4 py-2 text-sm font-black uppercase tracking-wide text-white shadow-sm">
            MODO OWNER
          </div>
        )}
        {can("cashier.close_cash.view") && session && (
          <button
            onClick={() => setShowCloseModal(true)}
            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-semibold transition"
          >
            Hacer Cierre
          </button>
        )}
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden">
        {!permissionsLoading && tabs.length === 0 && (
          <div className="h-full flex items-center justify-center px-6 text-center">
            Tu usuario no tiene permisos asignados para cashier.
          </div>
        )}

        {tab === "orders" && can("cashier.orders.view") && (session || isOwnerMode) && (
          <SalesTab session={session} />
        )}

        {tab === "orders" && can("cashier.orders.view") && !session && !isOwnerMode && (
          <div className="h-full flex items-center justify-center text-gray-400">
            Para tomar pedidos necesitás abrir una caja.
          </div>
        )}

        {tab === "kds" && can("cashier.kds.view") && <KDSTab />}

        {tab === "delivered" && can("cashier.orders.view") && <DeliveredTab session={session} />}

        {tab === "whatsapp" && can("cashier.chat.view") && (
          <CustomerChatList
            branchId={currentBranch?.id || ""}
            tenantId={currentBranch?.tenant_id || ""}
            onClose={() => setTab("board")}
            onUnreadChange={(count) => setWaUnread(count)}
          />
        )}

        {tab === "arqueos" && can("cashier.close_cash.view") && session && (
          <CashClosuresTab
            session={session}
            onCloseCash={() => setShowCloseModal(true)}
          />
        )}

        {tab === "mesas" && can("cashier.orders.view") && <MesasTab />}
      </div>

      {/* MODAL CIERRE */}
      {showCloseModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCloseModal(false)}
        >
          <div
            className="bg-gray-900 rounded-xl w-[700px] max-h-[90vh] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <CloseCash
              session={session}
              onCancel={() => setShowCloseModal(false)}
              onClosed={() => {
                setShowCloseModal(false);
                window.location.reload();
              }}
            />
          </div>
        </div>
      )}

      {/* MODAL RIDERS */}
      {showRiderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[500px] max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Riders trabajando hoy</h3>
              <button onClick={() => setShowRiderModal(false)} className="p-1 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="space-y-2">
              {riders.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No hay riders registrados</p>
              ) : riders.map((rider) => (
                <div key={rider.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                  <span className="text-sm font-medium text-gray-800">{rider.name} - {rider.phone}</span>
                  <button
                    onClick={() => toggleRiderWorking(rider.id, rider.is_working_today)}
                    className={`w-10 h-6 rounded-full transition flex items-center ${rider.is_working_today ? "bg-green-500 justify-end" : "bg-gray-300 justify-start"}`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white shadow mx-0.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
