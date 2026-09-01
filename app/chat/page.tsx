"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type BloqueContenido = { type: string; text?: string; [k: string]: any };
type Mensaje = { role: "user" | "assistant"; content: string | BloqueContenido[] };

type PendienteConfirmacion = {
  herramienta: string;
  input: any;
  toolUseId: string;
  mensajes: Mensaje[];
};

// Traduce el nombre técnico de la herramienta a algo legible en la tarjeta.
const ETIQUETAS_HERRAMIENTA: Record<string, string> = {
  crear_evento: "Crear evento",
  mover_evento: "Mover evento",
  eliminar_evento: "Eliminar evento",
};

function resumenAccion(herramienta: string, input: any): string {
  switch (herramienta) {
    case "crear_evento":
      return `"${input.titulo}" — ${new Date(input.inicio).toLocaleString("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      })}`;
    case "mover_evento":
      return `Nuevo horario: ${new Date(input.nuevoInicio).toLocaleString("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      })}`;
    case "eliminar_evento":
      return `ID: ${input.eventoId}`;
    default:
      return JSON.stringify(input);
  }
}

// Extrae solo el texto legible de un mensaje para mostrarlo/leerlo.
function textoDe(mensaje: Mensaje): string {
  if (typeof mensaje.content === "string") return mensaje.content;
  return mensaje.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// Red de seguridad: si el modelo se descuida y manda markdown,
// esto lo limpia antes de pasarlo al sintetizador de voz.
function limpiarParaVoz(texto: string): string {
  return texto
    .replace(/\*\*(.*?)\*\*/g, "$1") // **negrita** -> negrita
    .replace(/\*(.*?)\*/g, "$1") // *cursiva* -> cursiva
    .replace(/[_#>`]/g, "") // guiones bajos, numerales, citas, código
    .replace(/^-\s+/gm, "") // viñetas de lista
    .trim();
}

export default function ChatPage() {
  const { status } = useSession();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState("");
  const [cargando, setCargando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [vozActiva, setVozActiva] = useState(true);
  const [pendiente, setPendiente] = useState<PendienteConfirmacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  const [vozElegidaURI, setVozElegidaURI] = useState<string>("");

  const reconocimientoRef = useRef<any>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // Carga la lista de voces del navegador/SO. En Chrome esto llega
  // async vía el evento 'voiceschanged', no está lista de inmediato.
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    function cargarVoces() {
      const disponibles = window.speechSynthesis
        .getVoices()
        .filter((v) => v.lang.startsWith("es"));
      setVoces(disponibles);

      // Preferimos voces que digan "Natural" (las de Microsoft en Windows
      // 10/11 son notablemente mejores que las clásicas de Google/Chrome).
      if (!vozElegidaURI && disponibles.length > 0) {
        const natural = disponibles.find((v) => /natural/i.test(v.name));
        setVozElegidaURI((natural ?? disponibles[0]).voiceURI);
      }
    }

    cargarVoces();
    window.speechSynthesis.onvoiceschanged = cargarVoces;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, pendiente]);

  // Configura el reconocimiento de voz una sola vez.
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const reconocimiento = new SpeechRecognition();
    reconocimiento.lang = "es-CO";
    reconocimiento.continuous = false;
    reconocimiento.interimResults = false;

    reconocimiento.onresult = (e: any) => {
      const texto = e.results[0][0].transcript;
      setEntrada(texto);
      enviarMensaje(texto);
    };
    reconocimiento.onend = () => setEscuchando(false);
    reconocimiento.onerror = () => setEscuchando(false);

    reconocimientoRef.current = reconocimiento;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function hablar(texto: string) {
    if (!vozActiva || !texto) return;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); // no encimar audios

    const utterance = new SpeechSynthesisUtterance(limpiarParaVoz(texto));
    utterance.lang = "es-CO";
    utterance.rate = 1.02; // casi normal; un poco más lento se siente más natural
    utterance.pitch = 1;

    const voz = voces.find((v) => v.voiceURI === vozElegidaURI);
    if (voz) utterance.voice = voz;

    window.speechSynthesis.speak(utterance);
  }

  function activarMicrofono() {
    if (!reconocimientoRef.current) {
      setError("Este navegador no soporta reconocimiento de voz. Usa Chrome.");
      return;
    }
    setEscuchando(true);
    reconocimientoRef.current.start();
  }

  async function enviarMensaje(texto: string) {
    if (!texto.trim() || cargando) return;
    setError(null);
    setEntrada("");
    const nuevosMensajes: Mensaje[] = [...mensajes, { role: "user", content: texto }];
    setMensajes(nuevosMensajes);
    setCargando(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: nuevosMensajes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      if (data.tipo === "final") {
        setMensajes(data.mensajes);
        hablar(data.texto);
      } else if (data.tipo === "confirmacion_requerida") {
        setMensajes(data.mensajes);
        if (data.texto) hablar(data.texto);
        setPendiente({
          herramienta: data.herramienta,
          input: data.input,
          toolUseId: data.toolUseId,
          mensajes: data.mensajes,
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function responderConfirmacion(confirmado: boolean) {
    if (!pendiente) return;
    setCargando(true);
    setError(null);
    const solicitud = { ...pendiente };
    setPendiente(null);

    try {
      const res = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensajes: solicitud.mensajes,
          toolUseId: solicitud.toolUseId,
          herramienta: solicitud.herramienta,
          input: solicitud.input,
          confirmado,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      if (data.tipo === "final") {
        setMensajes(data.mensajes);
        hablar(data.texto);
      } else if (data.tipo === "confirmacion_requerida") {
        setMensajes(data.mensajes);
        if (data.texto) hablar(data.texto);
        setPendiente({
          herramienta: data.herramienta,
          input: data.input,
          toolUseId: data.toolUseId,
          mensajes: data.mensajes,
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="p-8 text-sm text-slate-500">
        Conecta tu cuenta de Google desde la página principal primero.
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Agente de calendario</h1>
        <div className="flex items-center gap-2">
          {vozActiva && voces.length > 0 && (
            <select
              value={vozElegidaURI}
              onChange={(e) => setVozElegidaURI(e.target.value)}
              className="max-w-[140px] truncate rounded-full border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
              title="Elegir voz"
            >
              {voces.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name.replace(/^Microsoft\s|^Google\s/, "")}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setVozActiva((v) => !v)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              vozActiva ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            {vozActiva ? "🔊" : "🔇"}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {mensajes
          .filter((m) => textoDe(m).trim().length > 0)
          .map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-900"
              }`}
            >
              {textoDe(m)}
            </div>
          ))}

        {pendiente && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
            <p className="mb-1 font-medium text-amber-900">
              {ETIQUETAS_HERRAMIENTA[pendiente.herramienta] ?? pendiente.herramienta}
            </p>
            <p className="mb-3 text-amber-800">
              {resumenAccion(pendiente.herramienta, pendiente.input)}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => responderConfirmacion(true)}
                disabled={cargando}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                onClick={() => responderConfirmacion(false)}
                disabled={cargando}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cargando && <p className="text-xs text-slate-400">Pensando…</p>}
        {error && (
          <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>
        )}
        <div ref={finRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviarMensaje(entrada);
        }}
        className="flex gap-2 border-t border-slate-200 pt-3"
      >
        <button
          type="button"
          onClick={activarMicrofono}
          disabled={cargando}
          className={`shrink-0 rounded-full px-3 py-2 text-sm ${
            escuchando ? "bg-red-500 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          {escuchando ? "🎙️ Escuchando…" : "🎤"}
        </button>
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder="Escribe o usa el micrófono…"
          disabled={cargando}
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={cargando || !entrada.trim()}
          className="shrink-0 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </main>
  );
}
