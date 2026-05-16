import type { StreamResponse } from '../services/llmApi';

/** Parse one SSE `data:` line into a stream payload. */
export function parseStreamResponseLine(line: string): StreamResponse | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice(5).trimStart();
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload) as StreamResponse;
  } catch {
    return null;
  }
}

/** Read an SSE body and yield parsed StreamResponse events. */
export async function* readChatStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<StreamResponse> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const event = parseStreamResponseLine(line);
      if (event) {
        yield event;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const event = parseStreamResponseLine(buffer);
    if (event) {
      yield event;
    }
  }
}
