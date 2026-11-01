import { createPostcard, methodNotAllowed } from "../lib/api-core.mjs";

export default async function handler(request, response) {
  return request.method === "POST" ? createPostcard(request, response) : methodNotAllowed(response, "POST");
}
