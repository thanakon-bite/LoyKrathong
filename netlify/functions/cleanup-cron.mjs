/**
 * Netlify Scheduled Function → calls the app's retention endpoint (expire lanterns, purge old content).
 * Schedule lives in netlify.toml. Needs CRON_SECRET in the site's environment variables.
 */
const cleanupCron = async () => {
  const base = process.env.URL; // provided by Netlify: the site's main URL
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.warn("[cleanup-cron] URL or CRON_SECRET is missing – skipped");
    return;
  }
  const res = await fetch(`${base}/api/cron/cleanup`, { headers: { Authorization: `Bearer ${secret}` } });
  console.log("[cleanup-cron]", res.status, (await res.text()).slice(0, 300));
};

export default cleanupCron;
