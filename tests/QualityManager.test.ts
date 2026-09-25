import { describe, it, expect } from 'vitest';
import { QualityManager } from '../src/core/QualityManager.js';

describe('QualityManager', () => {
  it('starts FULL when capability probe passes', () => {
    const qm = new QualityManager({ capabilityProbe: () => true });
    expect(qm.profile.tier).toBe('FULL');
  });

  it('starts FALLBACK when capability probe fails and never exits via frame timing', () => {
    const qm = new QualityManager({ capabilityProbe: () => false });
    expect(qm.profile.tier).toBe('FALLBACK');
    for (let i = 0; i < 20; i++) qm.reportFrameTime(5);
    expect(qm.profile.tier).toBe('FALLBACK');
  });

  it('does not downgrade on a single slow frame (hysteresis)', () => {
    const qm = new QualityManager({ capabilityProbe: () => true });
    qm.reportFrameTime(50);
    expect(qm.profile.tier).toBe('FULL');
  });

  it('downgrades to REDUCED after consecutive slow frames', () => {
    const qm = new QualityManager({ capabilityProbe: () => true });
    let tier;
    for (let i = 0; i < 5; i++) tier = qm.reportFrameTime(50);
    expect(tier).toBe('REDUCED');
  });

  it('upgrades back to FULL after consecutive fast frames', () => {
    const qm = new QualityManager({ capabilityProbe: () => true });
    for (let i = 0; i < 5; i++) qm.reportFrameTime(50);
    expect(qm.profile.tier).toBe('REDUCED');
    let tier;
    for (let i = 0; i < 5; i++) tier = qm.reportFrameTime(10);
    expect(tier).toBe('FULL');
  });

  it('does not flip-flop on alternating single fast/slow frames', () => {
    const qm = new QualityManager({ capabilityProbe: () => true });
    for (let i = 0; i < 10; i++) {
      qm.reportFrameTime(50);
      qm.reportFrameTime(10);
    }
    expect(qm.profile.tier).toBe('FULL');
  });
});
