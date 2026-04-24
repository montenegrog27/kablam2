"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [superadminEmail, setSuperadminEmail] = useState("");
  const [systemInfo, setSystemInfo] = useState<any>(null);

  useEffect(() => {
    // Read from environment variable (client-side)
    setSuperadminEmail(
      process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com",
    );
  }, []);

  const handleSave = async () => {
    setLoading(true);
    // Note: Environment variables cannot be updated from client-side.
    // This is just a mock action.
    setTimeout(() => {
      alert(
        "Los cambios se han guardado (simulado). Para cambiar variables de entorno, edita el archivo .env.local.",
      );
      setLoading(false);
    }, 500);
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">Configuración del Sistema</h1>

      <div className="max-w-4xl space-y-8">
        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">SuperAdmin</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Email del SuperAdministrador
              </label>
              <input
                type="email"
                value={superadminEmail}
                onChange={(e) => setSuperadminEmail(e.target.value)}
                className="w-full max-w-md border rounded-lg p-3"
                placeholder="admin@kablam.com"
              />
              <p className="text-sm text-gray-500 mt-2">
                Este email debe coincidir con el usuario autenticado en Supabase
                Auth para acceder a esta sección.
                <br />
                Variable de entorno:{" "}
                <code className="bg-gray-100 px-2">
                  NEXT_PUBLIC_SUPERADMIN_EMAIL
                </code>
              </p>
            </div>
            <div className="pt-4">
              <button
                onClick={handleSave}
                disabled={loading}
                className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Variables del Sistema</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                NEXT_PUBLIC_SUPABASE_URL
              </label>
              <code className="block bg-gray-100 p-2 rounded text-sm truncate">
                {process.env.NEXT_PUBLIC_SUPABASE_URL || "No definido"}
              </code>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">NODE_ENV</label>
              <code className="block bg-gray-100 p-2 rounded text-sm">
                {process.env.NODE_ENV}
              </code>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                WHATSAPP_API_TOKEN
              </label>
              <code className="block bg-gray-100 p-2 rounded text-sm truncate">
                {process.env.WHATSAPP_API_TOKEN
                  ? `${process.env.WHATSAPP_API_TOKEN.substring(0, 20)}...`
                  : "No definido"}
              </code>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                WHATSAPP_PHONE_NUMBER_ID
              </label>
              <code className="block bg-gray-100 p-2 rounded text-sm">
                {process.env.WHATSAPP_PHONE_NUMBER_ID || "No definido"}
              </code>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Estado de la Base de Datos</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Conexión Supabase</span>
              <span className="font-medium text-green-600">Activa</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">URL</span>
              <span className="font-medium">
                {process.env.NEXT_PUBLIC_SUPABASE_URL
                  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Instrucciones</h2>
          <ul className="list-disc pl-5 space-y-2 text-gray-700">
            <li>
              Las variables de entorno se configuran en el archivo{" "}
              <code className="bg-gray-100 px-1">.env.local</code> de cada app.
            </li>
            <li>
              Para agregar un nuevo SuperAdmin, edita la variable{" "}
              <code className="bg-gray-100 px-1">
                NEXT_PUBLIC_SUPERADMIN_EMAIL
              </code>{" "}
              y reinicia el servidor.
            </li>
            <li>
              Asegúrate de que el email configurado exista en Supabase Auth.
            </li>
            <li>
              Los cambios en las variables de entorno requieren reiniciar el
              servidor de desarrollo.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
