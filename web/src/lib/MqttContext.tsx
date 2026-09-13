'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import mqtt, { MqttClient } from 'mqtt';
import { DeviceState, Channels, Schedule, WeeklyAssignment, MqttConfig } from './types';

// Default initial state
const defaultInitialState: DeviceState = {
  mode: 'auto',
  live: { blue: 45, white: 15, red: 5, uv: 30, fan: 40 },
  manualOverrideExpiresAt: null,
  activeScheduleId: 'natural_reef',
  acclimation: null,
  time: new Date().toISOString(),
  wifiConnected: true,
  cloudConnected: true,
  firmwareVersion: '1.0.0',
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
  publishOta: (url: string) => void;
  publishTime: (iso: string) => void;
  isSimulated: boolean;
  setSimulated: (sim: boolean) => void;
}

const MqttContext = createContext<MqttContextType | null>(null);

const DEFAULT_CONFIG: MqttConfig = {
  brokerUrl: process.env.NEXT_PUBLIC_HIVEMQ_WSS_URL || 'wss://your-broker.s1.eu.hivemq.cloud:8884/mqtt',
  username: process.env.NEXT_PUBLIC_HIVEMQ_USER || '',
  password: process.env.NEXT_PUBLIC_HIVEMQ_PASS || '',
  deviceId: process.env.NEXT_PUBLIC_DEVICE_ID || 'reef-esp32-01',
};

export function MqttProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<MqttConfig>(DEFAULT_CONFIG);
  const [deviceState, setDeviceState] = useState<DeviceState>(defaultInitialState);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(false);
  const [isBrokerConnected, setIsBrokerConnected] = useState<boolean>(false);
  const [lastSeen, setLastSeen] = useState<Date | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  const clientRef = useRef<MqttClient | null>(null);

  // Load config from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reef_mqtt_cfg');
      if (saved) {
        try {
          setConfig(JSON.parse(saved));
        } catch {
          // ignore corrupted local config
        }
      }
      const sim = localStorage.getItem('reef_simulated_mode');
      if (sim === 'true') {
        setIsSimulated(true);
        setIsDeviceOnline(true);
        setIsBrokerConnected(true);
      }
    }
  }, []);

  const saveConfig = (newCfg: MqttConfig) => {
    setConfig(newCfg);
    if (typeof window !== 'undefined') {
      localStorage.setItem('reef_mqtt_cfg', JSON.stringify(newCfg));
    }
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

  // Connect to MQTT broker via WebSocket Secure (WSS)
  useEffect(() => {
    if (isSimulated) return;
    if (!config.brokerUrl || config.brokerUrl.includes('your-broker')) {
      // Incomplete broker configuration, leave offline
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
        // Subscribe to retained state and status
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
  }, [config, isSimulated]);

  // Command Publishers
  const publishCmd = useCallback(
    (subTopic: string, payload: object) => {
      const jsonStr = JSON.stringify(payload);
      if (isSimulated) {
        // Local simulation handler for immediate feedback
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
  const publishOta = useCallback((url: string) => publishCmd('ota', { url }), [publishCmd]);
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
