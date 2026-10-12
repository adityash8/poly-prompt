import posthog from 'posthog-js';

export function initGrowthOS(apiKey) {
  if (!apiKey) return;
  posthog.init(apiKey, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    capture_pageview: false, autocapture: false, disable_session_recording: true, persistence: 'memory',
    person_profiles: 'never', advanced_disable_feature_flags: true, respect_dnt: true,
    before_send: event => event.event === 'app_opened' ? { event: event.event, uuid: event.uuid, timestamp: event.timestamp,
      properties: { token: event.properties.token, distinct_id: event.properties.distinct_id, $process_person_profile: false } } : null });
  // This function is called only after an explicit analytics opt-in, including re-enabling it.
  posthog.opt_in_capturing({ captureEventName: false });
  posthog.capture('app_opened');
}

export function stopGrowthOS() { posthog.reset(); posthog.opt_out_capturing(); }
