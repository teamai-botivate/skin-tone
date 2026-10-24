import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getCreditTransactions } from "@/lib/credits";

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const history = await getCreditTransactions(user.id);
    return NextResponse.json({ history, balance: user.credits });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch credit history" }, { status: 500 });
  }
}
