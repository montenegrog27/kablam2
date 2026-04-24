"use client";

import { useParams } from "next/navigation";

export default function SuccessPage() {
  const params = useParams();
  const branchSlug = params.branchSlug as string;

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="max-w-md w-full text-center space-y-6">
        
        {/* ICONO */}
        <div className="text-5xl">🎉</div>

        {/* TITULO */}
        <h1 className="text-2xl font-bold">
          ¡Pedido confirmado!
        </h1>

        {/* TEXTO */}
        <p className="text-gray-600">
          Tu pedido fue enviado correctamente.  
          En breve recibirás la confirmación por WhatsApp.
        </p>

        {/* BOTÓN */}
        <a
          href={`/${branchSlug}/order`}
          className="block w-full bg-black text-white py-3 rounded-lg"
        >
          Volver al menú
        </a>

      </div>
    </div>
  );
}