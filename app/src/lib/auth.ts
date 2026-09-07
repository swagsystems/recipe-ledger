import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "recipe_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type LocalUser = {
  id: string;
  name: string;
};

export function getConfiguredUsers() {
  const raw = process.env.RECIPE_TRACKER_USERS || "";
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, pin] = entry.split(":", 2);
      return { name: name?.trim(), pin: pin?.trim() };
    })
    .filter((entry): entry is { name: string; pin: string } => Boolean(entry.name && entry.pin));

  return new Map(entries.map((entry) => [entry.name.toLowerCase(), entry]));
}

export async function getCurrentUser(): Promise<LocalUser | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  if (!value) return null;

  const [name, expiresRaw, signature] = value.split(".");
  const expires = Number(expiresRaw);
  if (!name || !expires || !signature || Date.now() > expires) {
    return null;
  }

  const expected = sign(name, expires);
  if (!safeEqual(signature, expected)) {
    return null;
  }

  const configured = getConfiguredUsers().get(name.toLowerCase());
  if (!configured) return null;

  return { id: configured.name.toLowerCase(), name: configured.name };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function signInWithPin(name: string, pin: string) {
  const configured = getConfiguredUsers().get(name.trim().toLowerCase());
  if (!configured || configured.pin !== pin.trim()) {
    return false;
  }

  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  (await cookies()).set(COOKIE_NAME, `${configured.name}.${expires}.${sign(configured.name, expires)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.RECIPE_COOKIE_SECURE === "true",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
  return true;
}

export async function signOut() {
  (await cookies()).delete(COOKIE_NAME);
}

function sign(name: string, expires: number) {
  const secret = process.env.RECIPE_TRACKER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("RECIPE_TRACKER_AUTH_SECRET is required");

  return createHmac("sha256", secret).update(`${name}|${expires}`).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
