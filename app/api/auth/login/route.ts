import { getAuthConfig } from "../../../../lib/auth-runtime";
import { login } from "../../../../lib/auth";

export async function POST(request: Request) {
  return login(request, getAuthConfig());
}
