import { OBD_PIDS, obdToPatch, parseJsonLine, parseObdResponse } from '../../sources';
import type { ObdPid } from '../../sources';
import { sendSim } from '../sim/simClient';

/**
 * Web Serial connections (Phase 13; review "Hardware roadmap"). The page owns the port and hands
 * each reading to the worker as a telemetry patch; the worker's LiveSource feeds the same Twin and
 * analytics as the simulator. Web Serial needs Chrome or Edge on a computer and a secure context
 * (http://localhost counts). Nothing here has been run against real hardware yet (Q-59).
 */

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<BufferSource> | null;
  writable: WritableStream<Uint8Array> | null;
}

export const serialAvailable = () =>
  typeof navigator !== 'undefined' && 'serial' in navigator && window.isSecureContext;

async function requestPort(baudRate: number): Promise<SerialPortLike> {
  const serial = (navigator as unknown as { serial?: { requestPort(): Promise<SerialPortLike> } })
    .serial;
  if (!serial)
    throw new Error('Web Serial is not available here. Use Chrome or Edge on a computer.');
  const port = await serial.requestPort();
  await port.open({ baudRate });
  return port;
}

export interface Connection {
  stop: () => Promise<void>;
}

/** ESP32 streaming one JSON object per line (Telemetry field names), 115,200 baud. */
export async function connectEsp32(onError: (m: string) => void): Promise<Connection> {
  const port = await requestPort(115_200);
  sendSim({ type: 'useLive', name: 'ESP32 (serial)' });
  const reader = port.readable!.pipeThrough(new TextDecoderStream()).getReader();
  let stopped = false;
  void (async () => {
    let buf = '';
    try {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const patch = parseJsonLine(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (patch) sendSim({ type: 'liveTelemetry', patch });
        }
      }
    } catch (e) {
      if (!stopped) onError(e instanceof Error ? e.message : 'Serial read failed.');
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await reader.cancel().catch(() => undefined);
      await port.close().catch(() => undefined);
    },
  };
}

/** Polled PIDs (review table; 0B manifold pressure is read but has no Telemetry field yet). */
const POLL: readonly ObdPid[] = ['0C', '04', '05', '0F', '42'];

/**
 * USB ELM327 OBD-II adapter, 38,400 baud: reset, echo and spaces off, automatic protocol, then poll
 * mode-01 PIDs in a loop. Oil pressure and oil temperature have no standard PID, so they stay
 * "not fitted".
 */
export async function connectObd(onError: (m: string) => void): Promise<Connection> {
  const port = await requestPort(38_400);
  sendSim({ type: 'useLive', name: 'OBD-II (ELM327)' });
  const writer = port.writable!.getWriter();
  const reader = port.readable!.pipeThrough(new TextDecoderStream()).getReader();
  const enc = new TextEncoder();
  let stopped = false;
  let buf = '';

  const command = async (cmd: string, timeoutMs = 1500) => {
    buf = '';
    await writer.write(enc.encode(`${cmd}\r`));
    const deadline = Date.now() + timeoutMs;
    while (!buf.includes('>') && Date.now() < deadline) {
      const r = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: false }>((res) =>
          setTimeout(() => res({ value: undefined, done: false }), 200),
        ),
      ]);
      if (r.done) throw new Error('The adapter closed the connection.');
      if (r.value) buf += r.value;
    }
    return buf;
  };

  void (async () => {
    try {
      for (const c of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATSP0']) await command(c, 3000);
      while (!stopped) {
        for (const pid of POLL) {
          if (stopped) break;
          const r = parseObdResponse(await command(`01${pid}`));
          if (r && OBD_PIDS[r.pid])
            sendSim({ type: 'liveTelemetry', patch: obdToPatch(r.pid, r.value) });
        }
      }
    } catch (e) {
      if (!stopped) onError(e instanceof Error ? e.message : 'OBD-II read failed.');
    }
  })();

  return {
    stop: async () => {
      stopped = true;
      await reader.cancel().catch(() => undefined);
      writer.releaseLock();
      await port.close().catch(() => undefined);
    },
  };
}
