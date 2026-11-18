
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct product creation is disabled. " +
        "Use Receive Stock to add manager-approved shoes.",
    },
    { status: 403 }
  );
}
