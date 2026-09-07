import { redirect } from "next/navigation";
import { signInWithPin } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = String(formData.get("name") || "");
  const pin = String(formData.get("pin") || "");
  const ok = await signInWithPin(name, pin);

  if (!ok) {
    redirect(`/login?user=${encodeURIComponent(name)}&error=1`);
  }

  redirect("/");
}
