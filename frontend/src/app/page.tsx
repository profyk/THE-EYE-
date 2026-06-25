import { redirect } from "next/navigation";

// Server-side redirect, not a client component: this is the very first page
// loaded, before any client JS has had a chance to execute. A client-side
// effect-based redirect here depends on hydration completing first, which
// turned out to be fragile (observed hanging indefinitely through a proxy/
// tunnel in at least one real case, with zero console errors to diagnose).
// A server redirect needs no JS at all. The "already logged in -> skip to
// /events" nicety now lives on the login page instead (it has localStorage
// access since it always renders, so it can bounce forward from there).
export default function Home() {
  redirect("/login");
}
