import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

type Props = {
  searchParams?: Promise<{
    user?: string;
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams: rawSearchParams }: Props) {
  const searchParams = await rawSearchParams;
  const user = await getCurrentUser();
  if (user) redirect("/");

  const selectedUser = searchParams?.user?.trim() || "";

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <section className="w-full rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-herb">Recipe Tracker</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{selectedUser ? "Enter PIN" : "Sign in"}</h1>
        </div>

        {!selectedUser ? (
          <form className="space-y-4" method="get" action="/login">
            <label className="block text-sm font-medium">
              User
              <input
                className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-3 text-lg outline-none transition focus:border-herb focus:bg-white"
                name="user"
                autoComplete="username"
                autoFocus
              />
            </label>
            <button className="w-full rounded-md bg-ink px-4 py-3 font-semibold text-white transition hover:bg-herb">Continue</button>
          </form>
        ) : (
          <form className="space-y-4" method="post" action="/api/login">
            <input type="hidden" name="name" value={selectedUser} />
            <label className="block text-sm font-medium">
              {selectedUser}
              <input
                className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-3 text-center text-2xl tracking-[0.3em] outline-none transition focus:border-herb focus:bg-white"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
              />
            </label>
            {searchParams?.error ? <p className="text-sm font-medium text-tomato">Wrong user or PIN.</p> : null}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button className="rounded-md bg-ink px-4 py-3 font-semibold text-white transition hover:bg-herb">Sign in</button>
              <a className="rounded-md border border-line px-4 py-3 font-semibold transition hover:border-herb hover:text-herb" href="/login">
                Change user
              </a>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
