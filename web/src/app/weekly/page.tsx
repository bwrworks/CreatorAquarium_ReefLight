'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function WeeklyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/schedule');
  }, [router]);

  return null;
}
