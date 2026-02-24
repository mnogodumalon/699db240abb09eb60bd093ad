import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Rechnung } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [rechnung, setRechnung] = useState<Rechnung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [rechnungData] = await Promise.all([
        LivingAppsService.getRechnung(),
      ]);
      setRechnung(rechnungData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { rechnung, setRechnung, loading, error, fetchAll };
}