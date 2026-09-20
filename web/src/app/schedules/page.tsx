'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SchedulesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/schedule');
  }, [router]);

  return null;
}
