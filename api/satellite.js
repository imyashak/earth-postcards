import { methodNotAllowed, satelliteImage } from "../lib/api-core.mjs";

export default async function handler(request, response) {
  return request.method === "GET" ? satelliteImage(request, response) : methodNotAllowed(response, "GET");
}
