import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/AuthContext';
import { MqttProvider } from '../lib/MqttContext';
import { AuthGate } from '../components/AuthGate';
import { TopHeader, BottomNav } from '../components/Navigation';

export const metadata: Metadata = {
  title: 'Reef Light Controller | Cloud-Connected ESP32',
  description: 'Precision 4-channel LED and fan automation dashboard for reef aquariums with autonomous ESP32 schedule engine and HiveMQ Cloud connectivity.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
        <meta name="theme-color" content="#070d18" />
      </head>
      <body>
        <AuthProvider>
          <AuthGate>
            <MqttProvider>
              <div className="app-container">
                <TopHeader />
                <main style={{ flex: 1, padding: '1rem' }}>{children}</main>
                <BottomNav />
              </div>
            </MqttProvider>
          </AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
