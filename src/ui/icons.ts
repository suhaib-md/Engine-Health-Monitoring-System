import {
  Activity,
  AudioWaveform,
  BatteryCharging,
  Box,
  ChartLine,
  CircleCheck,
  Database,
  Droplet,
  FileText,
  Flame,
  Gauge,
  Info,
  OctagonAlert,
  ScanLine,
  Sigma,
  Thermometer,
  Weight,
  ThermometerSun,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { AlertClass } from './tokens';
import type { PageId } from './store';

/**
 * One icon per concept, used everywhere (lucide-react: bundled SVGs, so the app stays offline).
 * Icons are decoration: every one sits beside a text label, so they are aria-hidden.
 */
export type { LucideIcon };

export const pageIcon: Record<PageId, LucideIcon> = {
  live: Box,
  trends: ChartLine,
  vibration: AudioWaveform,
  math: Sigma,
  validation: CircleCheck,
  report: FileText,
  debug: Database,
};

export const signalIcon = {
  rpm: Gauge,
  coolant: Thermometer,
  oilTemp: ThermometerSun,
  oilPress: Droplet,
  voltage: BatteryCharging,
  vibration: Activity,
  load: Weight,
} satisfies Record<string, LucideIcon>;

export const subsystemIcon: Record<string, LucideIcon> = {
  lubrication: Droplet,
  thermal: Thermometer,
  vibration: Activity,
  combustion: Flame,
  electrical: Zap,
  sensors: ScanLine,
};

export const alertIcon: Record<AlertClass, LucideIcon> = {
  INFO: Info,
  WATCH: TriangleAlert,
  WARNING: TriangleAlert,
  CRITICAL: OctagonAlert,
};
