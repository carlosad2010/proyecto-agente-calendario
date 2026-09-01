import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

/**
 * Permisos que le pedimos a Google.
 * openid/email/profile son para saber quién eres.
 * .../auth/calendar es lectura Y escritura sobre tus calendarios.
 */
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

/**
 * El access_token de Google dura 1 hora. El refresh_token no vence
 * (mientras no revoques el acceso) y sirve para pedir uno nuevo.
 * Esta función hace justamente ese cambio.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    if (!token.refreshToken) throw new Error("No hay refresh_token guardado");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      // Google normalmente NO devuelve un refresh_token nuevo:
      // si no viene, conservamos el que ya teníamos.
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (error) {
    console.error("Falló el refresh del token de Google:", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // ESTAS DOS LÍNEAS SON LA CLAVE DE TODA LA FASE:
          // sin access_type=offline Google no entrega refresh_token,
          // y sin prompt=consent solo lo entrega la primerísima vez
          // que autorizas la app (y nunca más, aunque borres la sesión).
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    /**
     * Este callback corre en cada request. `account` solo llega
     * poblado en el login inicial; ahí es donde capturamos los tokens.
     */
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at ? account.expires_at * 1000 : 0,
        };
      }

      // Renovamos 1 minuto antes de que venza, para no quedar en la mitad
      // de una llamada a Calendar con un token muerto.
      if (Date.now() < (token.expiresAt as number) - 60_000) {
        return token;
      }

      return refreshAccessToken(token);
    },

    /**
     * Lo que exponemos al servidor y al cliente. Ojo: el refreshToken
     * NUNCA sale de aquí, solo el accessToken de turno.
     */
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
};
