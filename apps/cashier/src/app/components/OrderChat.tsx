"use client";

export default function OrderChatMock({
  order,
  onClose,
}: any) {

  return (
    <div className="w-[520px] h-full flex flex-col bg-white border-l border-gray-200">

      {/* HEADER */}
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">

        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Chat pedido #{order?.id?.slice(0,4)}
          </h2>

          <p className="text-xs text-gray-500">
            Cliente: {order?.customer_name || "Cliente"}
          </p>
        </div>

        <button
          onClick={onClose}
          className="text-sm text-red-500 hover:text-red-600"
        >
          Cerrar
        </button>

      </div>

      {/* MENSAJES MOCK */}

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        <div className="flex justify-start">
          <div className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg text-sm max-w-[70%]">
            Hola! Quería consultar mi pedido
          </div>
        </div>

        <div className="flex justify-end">
          <div className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm max-w-[70%]">
            Ya está en preparación 👨‍🍳
          </div>
        </div>

        <div className="flex justify-start">
          <div className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg text-sm max-w-[70%]">
            Perfecto gracias!
          </div>
        </div>

      </div>

      {/* INPUT MOCK */}

      <div className="p-4 border-t flex gap-2">

        <input
          placeholder="Escribir mensaje..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        <button
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm"
        >
          Enviar
        </button>

      </div>

    </div>
  );
}