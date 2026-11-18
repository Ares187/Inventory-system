
import { getLoggedInEmployee } from "../../../../lib/employee-session";

export async function GET() {
  try {
    const employee = await getLoggedInEmployee();

    if (!employee) {
      return Response.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return Response.json({
      authenticated: true,
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role,
      },
    });
  } catch (error) {
    console.error("Authentication check failed:", error);

    return Response.json(
      { error: "Unable to check login status" },
      { status: 500 }
    );
  }
}
