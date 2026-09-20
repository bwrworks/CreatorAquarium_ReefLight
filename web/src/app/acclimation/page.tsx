'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AcclimationRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/schedule');
  }, [router]);

  return null;
}
