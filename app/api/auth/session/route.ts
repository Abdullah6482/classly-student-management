import { getSessionResponse } from "../../../../lib/auth";
import { getAuthConfig } from "../../../../lib/auth-runtime";

export async function GET(request: Request) {
  return getSessionResponse(request, getAuthConfig());
}
