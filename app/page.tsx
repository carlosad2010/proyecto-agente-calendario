"use client";

import { useEffect, useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import type { EventoNormalizado } from "@/lib/google-calendar";

const TZ = "America/Bogota";

function formatearDia(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(new Date(iso));
}

function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export default function Home() {
  const { data: session, status } = useSession();
  const [eventos, setEventos] = useState<EventoNormalizado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    setCargando(true);
    fetch("/api/events?dias=7")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Error desconocido");
        return data;
      })
      .then((data) => setEventos(data.eventos))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [status]);

  if (status === "loading") {
    return <main className="p-8 text-sm text-slate-500">Cargando…</main>;
  }

  if (status !== "authenticated") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Agente de calendario
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Conecta tu cuenta de Google para leer y organizar tu agenda.
          </p>
        </div>
        <button
          onClick={() => signIn("google")}
          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Conectar Google Calendar
        </button>
      </main>
    );
  }

  // Agrupamos por día para que se lea como una agenda, no como una lista plana
  const porDia = eventos.reduce<Record<string, EventoNormalizado[]>>(
    (acc, ev) => {
      const dia = formatearDia(ev.inicio);
      (acc[dia] ??= []).push(ev);
      return acc;
    },
    {}
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Próximos 7 días
          </h1>
          <p className="text-sm text-slate-500">{session.user?.email}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-900"
        >
          Desconectar
        </button>
      </header>

      {cargando && <p className="text-sm text-slate-500">Leyendo tu agenda…</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {!cargando && !error && eventos.length === 0 && (
        <p className="text-sm text-slate-500">
          No hay eventos en los próximos 7 días.
        </p>
      )}

      <div className="space-y-8">
        {Object.entries(porDia).map(([dia, delDia]) => (
          <section key={dia}>
            <h2 className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-400">
              {dia}
            </h2>
            <ul className="space-y-2">
              {delDia.map((ev) => (
                <li
                  key={ev.id}
                  className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="w-20 shrink-0 text-sm tabular-nums text-slate-500">
                    {ev.todoElDia ? "Todo el día" : formatearHora(ev.inicio)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{ev.titulo}</p>
                    {ev.ubicacion && (
                      <p className="mt-0.5 truncate text-sm text-slate-500">
                        {ev.ubicacion}
                      </p>
                    )}
                    {ev.invitados.length > 0 && (
                      <p className="mt-0.5 text-sm text-slate-500">
                        {ev.invitados.length} invitado
                        {ev.invitados.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
