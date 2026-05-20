import Link from "next/link";
import { Bike, ExternalLink, MapPin, QrCode, ShieldCheck } from "lucide-react";

export default function RiderHomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#66746b]">
            Kablam
          </p>
          <h1 className="mt-1 text-3xl font-black text-[#171512]">
            Rider pickup
          </h1>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[#193d3f] text-white shadow-sm">
          <Bike size={24} />
        </div>
      </header>

      <section className="mt-10 space-y-6">
        <div className="rounded-lg border border-[#ded7ca] bg-white/80 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#d96f32] text-white">
              <QrCode size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#171512]">
                Abrir una sesion temporal
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#5d625d]">
                Esta app esta pensada para links que el local envia por
                WhatsApp a la cadeteria. El rider abre el link, escanea el QR
                del ticket y arma su cola de entregas desde el local.
              </p>
            </div>
          </div>

          <Link
            href="/session/demo-cadeteria"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#193d3f] px-4 text-sm font-bold text-white shadow-sm transition active:scale-[0.99]"
          >
            Probar sesion demo
            <ExternalLink size={18} />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Cotizacion",
              text: "El link puede mostrar direccion y datos utiles para que la cadeteria pase precio.",
            },
            {
              icon: ShieldCheck,
              title: "Retiro real",
              text: "El pedido solo queda retirado despues de escanear el QR fisico del ticket.",
            },
            {
              icon: Bike,
              title: "Cola",
              text: "Varios tickets escaneados se ordenan en una fila de entregas.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-[#ded7ca] bg-white/70 p-4"
            >
              <item.icon className="text-[#d96f32]" size={22} />
              <h3 className="mt-3 font-bold text-[#171512]">{item.title}</h3>
              <p className="mt-2 text-sm leading-5 text-[#626761]">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
