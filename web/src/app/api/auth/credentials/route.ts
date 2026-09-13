import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from '../../../../lib/auth-server';

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('reef_session')?.value;
  const { valid } = await verifySessionToken(sessionCookie);

  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Return server-only credentials to verified authenticated sessions
  return NextResponse.json({
    brokerUrl: process.env.HIVEMQ_WSS_URL || '',
    username: process.env.HIVEMQ_USER || '',
    password: process.env.HIVEMQ_PASS || '',
    deviceId: process.env.DEVICE_ID || 'reef-esp32-01',
    otaSecretToken: process.env.OTA_SECRET_TOKEN || '',
  });
}
