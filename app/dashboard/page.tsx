import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth-server";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  return <DashboardClient user={user} />;
}
