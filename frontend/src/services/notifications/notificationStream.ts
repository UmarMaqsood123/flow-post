export interface StreamEvent {
  event: string;
  data: string;
}

/**
 * Reads a Server-Sent Events body frame by frame. EventSource can't send an
 * Authorization header, and the access token must never go in a URL, so the
 * stream is read with fetch instead.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        // Lines starting with ":" are heartbeats.
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length > 0) onEvent({ event, data: data.join("\n") });
      boundary = buffer.search(/\r?\n\r?\n/);
    }
  }
}
