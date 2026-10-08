// Read-only connection handshake. Retry only an authenticated maintenance response,
// never a failed mutation, authentication error, or incompatible server.
export async function probeReady(read, { budget = 30000, now = Date.now, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const deadline = now() + budget;
  for (;;) {
    const response = await read();
    if (response.status === 200) return JSON.parse(new TextDecoder().decode(response.data));
    let problem; try { problem = JSON.parse(new TextDecoder().decode(response.data)); } catch { /* Not a maintenance response. */ }
    if (response.status !== 409 || problem?.code !== 'WORKSPACE_BUSY' || now() >= deadline) {
      throw new Error(response.status === 409 && problem?.code === 'WORKSPACE_BUSY' ? 'Workspace maintenance is still running. Retry shortly.' : `Server check failed (${response.status}).`);
    }
    await pause(Math.min(200, Math.max(0, deadline - now())));
  }
}
