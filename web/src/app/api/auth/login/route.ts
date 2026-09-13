import { NextResponse } from 'next/server';
import { createSignedSessionToken } from '../../../../lib/auth-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { passcode } = body;

    const expectedPasscode = process.env.APP_PASSCODE || 'reef_prod_passcode_change_me';

    if (!passcode || typeof passcode !== 'string' || passcode !== expectedPasscode) {
      // Artificial delay to prevent brute-force timing attacks
      await new Promise((resolve) => setTimeout(resolve, 300));
      return NextResponse.json({ error: 'Invalid passcode' }, { status: 401 });
    }

    // Generate cryptographically signed token
    const token = await createSignedSessionToken('admin');

    const response = NextResponse.json({ success: true });
    response.cookies.set('reef_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600, // 7 days
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Authentication error' }, { status: 500 });
  }
}
