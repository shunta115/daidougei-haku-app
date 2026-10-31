// Pure planning: do not use advertised Mbps as proof of service readiness.
export function evaluateTrial({ measuredMbps, viewers=500, kbps=848, margin=0.15, headroom=0.65, durationMinutes=60, startupSuccessRate, rebufferSeconds, errorRate }={}) {
  if (!Number.isFinite(measuredMbps) || measuredMbps<=0) return {pass:false,reason:'measured_bandwidth_missing'};
  if (!Number.isInteger(viewers)||viewers<1||!Number.isFinite(kbps)||kbps<=0||!Number.isFinite(durationMinutes)||durationMinutes<1) throw Error('invalid_inputs');
  const requiredMbps=viewers*kbps*(1+margin)/1000;
  const capacityPass=measuredMbps*headroom>=requiredMbps;
  if (![startupSuccessRate,rebufferSeconds,errorRate].every(Number.isFinite)) return {pass:false,reason:'real_quality_measurements_missing',requiredMbps,capacityPass};
  const pass=capacityPass&&durationMinutes>=60&&startupSuccessRate>=0.99&&rebufferSeconds<=0&&errorRate<=0.01;
  return {pass,reason:pass?'trial_passed':'trial_failed',requiredMbps,capacityPass};
}
