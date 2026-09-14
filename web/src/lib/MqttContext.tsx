'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { DeviceState, Channels, Schedule, WeeklyAssignment, MqttConfig } from './types';

const defaultInitialState: DeviceState = {
  mode: 'auto',
  live: { blue: 45, white: 15, red: 5, uv: 30, fan: 40 },
  manualOverrideExpiresAt: null,
  activeScheduleId: 'natural_reef',
  acclimation: null,
  time: '',
  wifiConnected: true,
  cloudConnected: true,
  firmwareVersion: '1.1.0',
  masterOn: true,
};

interface MqttContextType {
  deviceState: DeviceState;
  isDeviceOnline: boolean;
  isBrokerConnected: boolean;
  lastSeen: Date | null;
  config: MqttConfig;
  saveConfig: (newCfg: MqttConfig) => void;
  publishChannels: (channels: Channels) => void;
  publishMode: (mode: 'auto' | 'manual') => void;
  publishFan: (fanPct: number) => void;
  publishMaster: (masterOn: boolean) => void;
  publishSchedule: (schedule: Schedule | { action: 'delete'; id: string }) => void;
  publishWeekly: (weekly: WeeklyAssignment) => void;
  publishAcclimation: (
    payload: { action: 'start'; scheduleId: string; startPct: number; days: number } | { action: 'cancel' }
  ) => void;
  publishOta: (url: string, sha256: string) => void;
  publishTime: (iso: string) => void;
  isSimulated: boolean;
  setSimulated: (sim: boolean) => void;
  logout: () => Promise<void>;
}

const MqttContext = createContext<MqttContextType | null>(null);

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<MqttConfig>({
    brokerUrl: '',
    username: '',
    password: '',
    deviceId: 'reef-esp32-01',
    otaSecretToken: '',
  });

  const [deviceState, setDeviceState] = useState<DeviceState>(defaultInitialState);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(false);
  const [isBrokerConnected, setIsBrokerConnected] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  const clientRef = useRef<MqttClient | null>(null);

  // Fetch server-isolated credentials upon session establishment
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/login')) {
      return;
    }

    async function loadCredentials() {
      try {
        const res = await fetch('/api/auth/credentials');
        if (res.ok) {
          const creds = await res.json();
          setConfig((prev) => ({
            ...prev,
            ...creds,
          }));
        } else if (res.status === 401) {
          console.warn('[MQTT] Session not authenticated. Credentials deferred.');
          return;
        }
      } catch (e) {
        console.warn('[MQTT] Failed to fetch server credentials:', e);
      }

      const sim = localStorage.getItem('reef_simulated_mode');
      if (sim === 'true') {
        setIsSimulated(true);
        setIsDeviceOnline(true);
        setIsBrokerConnected(true);
      }
    }

    loadCredentials();
  }, []);

  const saveConfig = (newCfg: MqttConfig) => {
    setConfig(newCfg);
  };

  const setSimulatedMode = (sim: boolean) => {
    setIsSimulated(sim);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_simulated_mode', sim ? 'true' : 'false');
    }
    if (sim) {
      setIsDeviceOnline(true);
      setIsBrokerConnected(true);
      setLastSeen(new Date());
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  };

  // Connect to MQTT broker over WebSocket Secure (WSS) using server-provided credentials
  useEffect(() => {
    if (isSimulated) return;
    if (!config.brokerUrl || !config.brokerUrl.startsWith('wss://')) {
      return;
    }

    try {
      const client = mqtt.connect(config.brokerUrl, {
        username: config.username,
        password: config.password,
        clientId: `reef-web-${Math.random().toString(16).substring(2, 8)}`,
        reconnectPeriod: 4000,
        connectTimeout: 8000,
        clean: true,
      });

      clientRef.current = client;

      const stateTopic = `reef/${config.deviceId}/state`;
      const statusTopic = `reef/${config.deviceId}/status`;

      client.on('connect', () => {
        setIsBrokerConnected(true);
        client.subscribe([stateTopic, statusTopic], { qos: 1 });
      });

      client.on('close', () => {
        setIsBrokerConnected(false);
      });

      client.on('error', (err) => {
        console.warn('[MQTT WSS Error]', err);
        setIsBrokerConnected(false);
      });

      client.on('message', (topic, message) => {
        const payload = message.toString();
        setLastSeen(new Date());

        if (topic === statusTopic) {
          const online = payload.trim().toLowerCase() === 'online';
          setIsDeviceOnline(online);
        } else if (topic === stateTopic) {
          try {
            const parsed = JSON.parse(payload);
            setDeviceState((prev) => ({
              ...prev,
              ...parsed,
              masterOn: parsed.masterOn !== undefined ? parsed.masterOn : prev.masterOn,
            }));
            setIsDeviceOnline(true);
          } catch (e) {
            console.error('[MQTT] Failed to parse state payload:', e);
          }
        }
      });

      return () => {
        client.end(true);
      };
    } catch (err) {
      console.error('[MQTT Connect Exception]', err);
    }
  }, [config.brokerUrl, config.username, config.password, config.deviceId, isSimulated]);

  // Command Publishers
  const publishCmd = useCallback(
    (subTopic: string, payload: object) => {
      const jsonStr = JSON.stringify(payload);
      if (isSimulated) {
        if (subTopic === 'channels') {
          const ch = payload as Channels;
          setDeviceState((prev) => ({
            ...prev,
            mode: 'manual',
            live: { ...prev.live, ...ch },
            manualOverrideExpiresAt: new Date(Date.now() + 7200000).toISOString(),
          }));
        } else if (subTopic === 'mode') {
          const m = (payload as { mode: 'auto' | 'manual' }).mode;
          setDeviceState((prev) => ({ ...prev, mode: m }));
        } else if (subTopic === 'fan') {
          const fn = (payload as { value: number }).value;
          setDeviceState((prev) => ({ ...prev, live: { ...prev.live, fan: fn } }));
        } else if (subTopic === 'master') {
          const m = (payload as { master: boolean }).master;
          setDeviceState((prev) => ({ ...prev, masterOn: m }));
        }
        return;
      }

      if (!clientRef.current || !clientRef.current.connected) {
        console.warn('[MQTT] Cannot publish command: broker disconnected.');
        return;
      }

      const topic = `reef/${config.deviceId}/cmd/${subTopic}`;
      clientRef.current.publish(topic, jsonStr, { qos: 1 });
    },
    [config.deviceId, isSimulated]
  );

  const publishChannels = useCallback((ch: Channels) => publishCmd('channels', ch), [publishCmd]);
  const publishMode = useCallback((m: 'auto' | 'manual') => publishCmd('mode', { mode: m }), [publishCmd]);
  const publishFan = useCallback((f: number) => publishCmd('fan', { value: f }), [publishCmd]);
  const publishMaster = useCallback((m: boolean) => publishCmd('master', { master: m }), [publishCmd]);
  const publishSchedule = useCallback((s: Schedule | { action: 'delete'; id: string }) => publishCmd('schedule', s), [publishCmd]);
  const publishWeekly = useCallback((w: WeeklyAssignment) => publishCmd('weekly', w), [publishCmd]);
  const publishAcclimation = useCallback(
    (p: { action: 'start'; scheduleId: string; startPct: number; days: number } | { action: 'cancel' }) =>
      publishCmd('acclimation', p),
    [publishCmd]
  );

  // Hardened OTA publish: transmits URL, SHA-256, and verified server token
  const publishOta = useCallback(
    (url: string, sha256: string) => {
      publishCmd('ota', {
        url,
        token: config.otaSecretToken || '',
        sha256,
      });
    },
    [publishCmd, config.otaSecretToken]
  );

  const publishTime = useCallback((time: string) => publishCmd('time', { time }), [publishCmd]);

  return (
    <MqttContext.Provider
      value={{
        deviceState,
        isDeviceOnline,
        isBrokerConnected,
        lastSeen,
        config,
        saveConfig,
        publishChannels,
        publishMode,
        publishFan,
        publishMaster,
        publishSchedule,
        publishWeekly,
        publishAcclimation,
        publishOta,
        publishTime,
        isSimulated,
        setSimulated: setSimulatedMode,
        logout,
      }}
    >
      {children}
    </MqttContext.Provider>
  );
}

export function useDeviceMqtt() {
  const ctx = useContext(MqttContext);
  if (!ctx) {
    throw new Error('useDeviceMqtt must be used within an MqttProvider');
  }
  return ctx;
}
