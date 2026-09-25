import { useEffect, useState } from 'react';
import { QualityManager } from '../../core/QualityManager.js';
import { probeWebGLCapability } from '../../errors/ErrorBoundary.js';
import type { QualityProfile } from '../../types.js';

/** Standalone quality-tier subscription for components outside a SceneManager. */
export function useQualityProfile(): QualityProfile {
  const [manager] = useState(() => new QualityManager({ capabilityProbe: probeWebGLCapability }));
  const [profile, setProfile] = useState<QualityProfile>(manager.profile);

  useEffect(() => {
    setProfile(manager.profile);
  }, [manager]);

  return profile;
}
