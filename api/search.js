import { methodNotAllowed, searchPlaces } from "../lib/api-core.mjs";

export default async function handler(request, response) {
  return request.method === "GET" ? searchPlaces(request, response) : methodNotAllowed(response, "GET");
}
