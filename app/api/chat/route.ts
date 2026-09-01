import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { correrAgente, type MensajeAgente } from "@/lib/agent";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "La sesión con Google expiró. Vuelve a conectar tu cuenta." },
      { status: 401 }
    );
  }

  const { mensajes } = (await request.json()) as { mensajes: MensajeAgente[] };

  try {
    const resultado = await correrAgente(mensajes, session.accessToken);
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return NextResponse.json(
      { error: error.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
