// Every request to the Harbour Market API goes through this module.
// The rest of the app imports these functions and never calls fetch() itself.
// The signatures are here; the bodies are yours (Lecture 8, Act 2).

// Your own market on the course server: put your GitHub username in the URL
// (lower case). The control page: https://harbour-api.lopin.me
export const API = "https://harbour-api.lopin.me/xkhaliil/api";

// An Error for a 4xx/5xx response, carrying the status and the parsed error
// body, so callers can tell a 404 from a 422 and read body.fields.
export class HttpError extends Error {
  constructor(response, body) {
    const message = body?.message
      ? `HTTP ${response.status}: ${body.message}`
      : `HTTP ${response.status}`;
    super(message);
    this.name = "HttpError";
    this.status = response.status;
    this.body = body;
  }
}

// One request, JSON in and out. `path` is relative to API: request("GET", "/stalls").
// Resolves with the parsed body (null for a 204); rejects with an HttpError
// for 4xx/5xx, and lets network errors and aborts through.
export async function request(method, path, data, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (data !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API}${path}`, {
    ...options,
    method,
    headers,
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new HttpError(response, body);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const getJSON = (path, options) => request("GET", path, undefined, options);
export const postJSON = (path, data, options) => request("POST", path, data, options);

// A short sentence for people; the error itself goes to the console.
export function describe(error) {
  if (error instanceof HttpError) return `the server answered ${error.status}`;
  if (error?.name === "TypeError") return "no connection";
  return "something went wrong";
}
