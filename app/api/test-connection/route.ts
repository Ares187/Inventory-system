
import { supabase } from "../../../lib/supabase";
export async function GET() {
    if (!supabase) {
  return Response.json({
    connected: false,
    error: "Supabase client is not initialized"
  }, { status: 500 });
}
  const { error } = await supabase
    .from("products")
    .select("id")
    .limit(1);

  if (error) {
    return Response.json({
      connected: false,
      error: error.message
    });
  }

  return Response.json({
    connected: true
  });
}
