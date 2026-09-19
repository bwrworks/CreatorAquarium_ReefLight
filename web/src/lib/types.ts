export type Channels = {
  blue: number;   // 0-100% (10x Royal Blue, GPIO 18+19)
  white: number;  // 0-100% (4x Day White, GPIO 32)
  uv: number;     // 0-100% (2x Actinic UV, GPIO 33)
};

export type Keyframe = {
  time: string; // "HH:MM"
} & Channels;

export type Schedule = {
  id: string;
  name: string;
  keyframes: Keyframe[]; // sorted by time, min 2
};

export type WeeklyAssignment = {
  mon: string;
  tue: string;
  wed: string;
  thu: string;
  fri: string;
  sat: string;
  sun: string;
};

export type Acclimation = {
  active: boolean;
  scheduleId: string;
  startPct: number;   // 0-100
  daysTotal: number;  // days
  startedAt: string;  // ISO timestamp
} | null;

export type DeviceState = {
  mode: "auto" | "manual";
  live: Channels & { fan: number };
  manualOverrideExpiresAt: string | null; // ISO timestamp
  activeScheduleId: string;
  acclimation: Acclimation;
  time: string; // device's current time, ISO
  wifiConnected: boolean;
  cloudConnected: boolean;
  firmwareVersion: string;
  masterOn?: boolean;
  fanInverted?: boolean;
  fanManualOverride?: boolean;
  displayBrightness?: number;
};

export type MqttConfig = {
  brokerUrl: string; // e.g. "wss://xxxxxx.s1.eu.hivemq.cloud:8884/mqtt"
  username?: string;
  password?: string;
  deviceId: string;
  otaSecretToken?: string;
};
