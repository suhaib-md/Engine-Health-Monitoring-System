import { useEffect, useRef, useState } from 'react';
import { Button, Panel } from '../primitives';
import { useSim } from '../sim/simClient';
import { color } from '../tokens';
import {
  deviceSpectrum,
  startMotion,
  type DeviceSpectrum,
  type MotionSample,
} from './accelerometer';

/**
 * Your device's accelerometer through the same FFT (Phase 13). Lay the phone or laptop on
 * something that vibrates and the dominant frequency appears; with the engine running, it is also
 * given as an engine order.
 */
export function AccelerometerPanel() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<DeviceSpectrum | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const buf = useRef<MotionSample[]>([]);
  const rpm = useSim((s) => s.snapshot?.telemetry.rpm ?? 0);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setSpec(deviceSpectrum(buf.current)), 1000);
    return () => clearInterval(id);
  }, [on]);
  useEffect(() => () => stop.current?.(), []);

  const toggle = async () => {
    if (on) {
      stop.current?.();
      stop.current = null;
      setOn(false);
      return;
    }
    setError(null);
    buf.current = [];
    try {
      stop.current = await startMotion((s) => {
        buf.current.push(s);
        // keep the last 4 s
        while (buf.current.length && s.t - buf.current[0]!.t > 4) buf.current.shift();
      });
      setOn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the motion sensor.');
    }
  };

  const top = spec ? Math.max(...spec.amps, 1e-6) : 1;
  return (
    <Panel className="flex flex-col gap-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-h2 font-bold">This device's accelerometer</h3>
          <span className="num text-label text-fg-3">
            experimental · the same radix-2 FFT as the engine analytics
          </span>
        </div>
        <Button variant="secondary" onClick={toggle}>
          {on ? 'Stop' : 'Start sensor'}
        </Button>
      </div>
      {error && <p className="m-0 text-sm text-warn">{error}</p>}
      {!on && !error && (
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-fg-2">
          On a phone or a laptop with a motion sensor, open IgniSense over https (or localhost on
          that device) and press Start. Phones sample at about 60 Hz, so this sees up to 30 Hz:
          enough for an idling engine's 1× and 2× lines, not for 3,000 rpm.
        </p>
      )}
      {on && spec && (
        <>
          <div className="num flex flex-wrap gap-x-8 gap-y-2 text-sm text-fg-2">
            <span>
              peak <b className="text-fg">{spec.peakHz.toFixed(1)} Hz</b>
            </span>
            <span>
              RMS <b className="text-fg">{spec.rms.toFixed(3)} m/s²</b>
            </span>
            <span>
              sample rate <b className="text-fg">{spec.fs.toFixed(0)} Hz</b>
            </span>
            {rpm > 0 && (
              <span>
                = order <b className="text-fg">{(spec.peakHz / (rpm / 60)).toFixed(2)}×</b> at{' '}
                {Math.round(rpm)} rpm
              </span>
            )}
          </div>
          <svg
            viewBox="0 0 400 120"
            className="block h-auto w-full"
            role="img"
            aria-label="Device spectrum"
          >
            {spec.amps.map((a, i) => {
              const h = (a / top) * 100;
              const w = 400 / spec.amps.length;
              return (
                <rect
                  key={i}
                  x={i * w}
                  y={110 - h}
                  width={Math.max(1, w - 0.5)}
                  height={h}
                  fill={color.accent}
                />
              );
            })}
            <line x1={0} x2={400} y1={110} y2={110} stroke={color.line} />
            <text x={0} y={120} fontSize={8} fill={color.fg3} fontFamily="JetBrains Mono">
              0 Hz
            </text>
            <text
              x={400}
              y={120}
              fontSize={8}
              fill={color.fg3}
              fontFamily="JetBrains Mono"
              textAnchor="end"
            >
              {(spec.fs / 2).toFixed(0)} Hz
            </text>
          </svg>
        </>
      )}
      {on && !spec && <p className="num m-0 text-sm text-fg-3">collecting samples…</p>}
    </Panel>
  );
}
