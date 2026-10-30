/** Never expose proxy HTML or an empty Response.json() exception to the user. */
export async function readAppJson(response: Response, action: string): Promise<unknown> {
  let text: string;
  try { text = await response.text(); } catch { throw new Error(`${action} could not be confirmed because the connection closed. Keep this page open and try again.`); }
  let data: unknown;
  if (text.trim()) { try { data = JSON.parse(text); } catch { /* Non-JSON gateway responses are handled below. */ } }
  if (!response.ok) {
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string" && data.error.length <= 1000) throw new Error(data.error);
    if (response.status === 401) throw new Error(`${action}: your session is no longer valid. Unlock Teach again.`);
    if (response.status === 413) throw new Error(`${action}: the request is too large (HTTP 413). Keep the draft and contact the workspace owner.`);
    throw new Error(`${action} could not be confirmed (HTTP ${response.status}). Keep this page open and try again. No automatic retry was made.`);
  }
  if (data === undefined) throw new Error(`${action} could not be confirmed: the server returned ${text.trim() ? "an invalid" : "an empty"} response (HTTP ${response.status}). Keep this page open and try again.`);
  return data;
}
