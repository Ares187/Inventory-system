
import { NextResponse } from "next/server";
import { getLoggedInEmployee } from "../../../../lib/employee-session";
import { hikeFetch } from "../../../../lib/hike-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Require owner login on the deployed website.
    if (process.env.NODE_ENV === "production") {
      const employee = await getLoggedInEmployee();

      if (!employee || employee.role !== "owner") {
        return NextResponse.json(
          { error: "Owner access required" },
          { status: 403 }
        );
      }
    }

    const response = await hikeFetch(
      "https://api.hikeup.com/api/v1/outlets/get_all"
    );

    if (!response.ok) {
      throw new Error(
        `Hike outlets request failed: HTTP ${response.status}`
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      outlets: data.items ?? data,
      inventoryChanged: false
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not retrieve Hike outlets",
        detail:
          error instanceof Error
            ? error.message
            : "Unknown error"
      },
      { status: 500 }
    );
  }
}
