// Keep the fetch/error handling in one place so components can focus on the UI.
export async function fetchJson(url, options = {}) {
  // Options lets callers pass things like a signal to cancel a request.
  const response = await fetch(url, options);

  let data;

  try {
    data = await response.json();
  } catch {
    // An HTML error page, for example, won't be valid JSON.
    throw new Error(
      "The server returned an unexpected response. Check that the backend is running."
    );
  }

  // Some existing endpoints return an error message even with a 200 status.
  // Check both the HTTP status and the response body.
  if (!response.ok || data?.error) {
    throw new Error(
      data?.error || `The request failed (${response.status}). Please try again.`
    );
  }

  return data;
}