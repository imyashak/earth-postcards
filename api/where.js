import { findPlace, methodNotAllowed } from "../lib/api-core.mjs";

export default async function handler(request, response) {
  return request.method === "POST" ? findPlace(request, response) : methodNotAllowed(response, "POST");
}
