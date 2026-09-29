import { useEffect, useRef, useState } from 'react';
import { Button, Panel } from '../primitives';
import { sendSim, useSim, useSourceMessage } from '../sim/simClient';
import { connectEsp32, connectObd, serialAvailable, type Connection } from './serial';

/**
 * Data sources (Phase 13). The simulator is one source among several; a CSV replay, an ESP32 or
 * an OBD-II adapter all emit the same Telemetry, and the Twin and analytics run unchanged.
 */
export function DataSourcePanel() {
  const source = useSim((s) => s.snapshot?.source);
  const message = useSourceMessage((s) => s.message);
  const [conn, setConn] = useState<Connection | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const say = (m: string) => useSourceMessage.setState({ message: m });
  // a "Loading…" note is stale once the new source is running
  const kind = source?.kind;
  const name = source?.name;
  useEffect(() => {
    if (kind === 'replay' && useSourceMessage.getState().message?.startsWith('Loading'))
      useSourceMessage.setState({ message: null });
  }, [kind, name]);

  const disconnect = async () => {
    await conn?.stop();
    setConn(null);
  };
  const connect = async (how: 'esp32' | 'obd') => {
    try {
      await disconnect();
      const c = await (how === 'esp32' ? connectEsp32 : connectObd)(say);
      setConn(c);
      say(
        how === 'esp32'
          ? 'ESP32 connected: reading JSON lines.'
          : 'OBD-II adapter connected: polling PIDs.',
      );
    } catch (e) {
      say(e instanceof Error ? e.message : 'Could not open the serial port.');
    }
  };

  const status =
    source?.kind === 'replay'
      ? `Replaying ${source.name} · ${Math.round((source.progress ?? 0) * 100)} %${source.done ? ' · finished' : ''}`
      : source?.kind === 'live'
        ? `Live from ${source.name} · ${source.count ?? 0} readings`
        : 'Simulator (the Plant, with its hidden faults)';

  return (
    <Panel tab className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-h2 font-bold">Data source</h3>
        <span className="num text-label text-fg-3">now: {status}</span>
      </div>
      <p className="m-0 max-w-3xl leading-relaxed text-fg-2">
        Every source emits the same telemetry, so the Twin, the checks and the diagnosis do not
        change. A CSV replay has no crank-angle windows (vibration and misfire are then not
        monitored); an OBD-II adapter has no oil sensors (those gauges read "— —").
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => sendSim({ type: 'exportRecording' })}>
          Download recording (CSV)
        </Button>
        <Button variant="secondary" onClick={() => file.current?.click()}>
          Replay a CSV…
        </Button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            await disconnect();
            say(`Loading ${f.name}…`);
            sendSim({ type: 'loadReplay', csv: await f.text(), name: f.name });
          }}
        />
        <Button
          variant="secondary"
          disabled={!serialAvailable()}
          title={serialAvailable() ? undefined : 'Needs Chrome or Edge on a computer'}
          onClick={() => connect('esp32')}
        >
          Connect ESP32
        </Button>
        <Button
          variant="secondary"
          disabled={!serialAvailable()}
          title={serialAvailable() ? undefined : 'Needs Chrome or Edge on a computer'}
          onClick={() => connect('obd')}
        >
          Connect OBD-II
        </Button>
        {source?.kind !== 'sim' && (
          <Button
            variant="primary"
            onClick={async () => {
              await disconnect();
              sendSim({ type: 'useSimulator' });
              say('Back on the simulator (cold engine).');
            }}
          >
            Back to simulator
          </Button>
        )}
      </div>
      {message && <p className="num m-0 text-sm text-fg-2">{message}</p>}
      <p className="num m-0 text-label leading-relaxed text-fg-3">
        The recording holds the last 30 simulated minutes at 20 Hz. Replaying it reproduces the
        diagnosis. ESP32: 115,200 baud, one JSON object per line using the telemetry field names
        (rpm, load, coolantC, oilC, oilPressBar, busV). OBD-II: USB ELM327, mode-01 PIDs 0C, 04, 05,
        0F, 42.
      </p>
    </Panel>
  );
}
