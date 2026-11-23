/**
 * Thai mobile-banking apps for the "เปิดแอปธนาคาร" shortcut – the button opens the installed app;
 * the store page is only the fallback when the app isn't installed.
 *
 *  - Android: intent URL with the Play Store package (+ the app's scheme when known), with
 *    S.browser_fallback_url = Play Store listing.
 *  - iOS: the app's custom URL scheme (a "download" link is shown separately – no automatic redirect).
 *
 * Store ids were checked against the live listings (App Store TH / Google Play, Nov 2026).
 * Schemes marked "2C2P" are from 2C2P's deeplink docs
 * (developer.2c2p.com/docs/sdk-references-handle-deeplink-payment-flow-by-pgw-sdk-helper);
 * the others are commonly used but unverified – test on an iPhone.
 */
export interface BankApp {
  id: string;
  name: string;
  /** brand colour for the button */
  color: string;
  /** Google Play package */
  android: string;
  /** App Store numeric id */
  ios: string;
  /** custom URL scheme without "://" */
  scheme: string;
}

export const BANK_APPS: BankApp[] = [
  { id: "kplus", name: "K PLUS", color: "#138f2d", android: "com.kasikorn.retail.mbanking.wap", ios: "361170631", scheme: "kplus" }, // unverified – test on iPhone
  { id: "scb", name: "SCB EASY", color: "#4e2e7f", android: "com.scb.phone", ios: "568388474", scheme: "scbeasy" }, // 2C2P
  { id: "ktb", name: "Krungthai NEXT", color: "#1ba5e1", android: "ktbcs.netbank", ios: "436753378", scheme: "ktbnext" }, // 2C2P
  { id: "bbl", name: "Bangkok Bank", color: "#1e4598", android: "com.bbl.mobilebanking", ios: "660238716", scheme: "bualuangmbanking" }, // 2C2P
  { id: "krungsri", name: "Krungsri", color: "#fec43b", android: "com.krungsri.kma", ios: "571873195", scheme: "krungsri-kma" }, // 2C2P
  { id: "ttb", name: "ttb touch", color: "#1279be", android: "com.TMBTOUCH.PRODUCTION", ios: "884079963", scheme: "ttbtouch" }, // unverified – test on iPhone
  { id: "gsb", name: "MyMo", color: "#eb198d", android: "com.mobilife.gsb.mymo", ios: "987047466", scheme: "mymo" }, // unverified – test on iPhone
];

export type MobilePlatform = "ios" | "android" | "desktop";

export function detectPlatform(ua: string, maxTouchPoints = 0): MobilePlatform {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1)) return "ios";
  return "desktop";
}

export function bankStoreUrl(bank: BankApp, platform: MobilePlatform): string {
  return platform === "ios" ? `https://apps.apple.com/th/app/id${bank.ios}` : `https://play.google.com/store/apps/details?id=${encodeURIComponent(bank.android)}`;
}

/** Android: opens the installed app (scheme + package); Chrome falls back to the Play Store listing */
export function androidIntentUrl(bank: BankApp): string {
  return `intent://#Intent;scheme=${bank.scheme};package=${bank.android};S.browser_fallback_url=${encodeURIComponent(bankStoreUrl(bank, "android"))};end`;
}

/**
 * Opens the bank app. Android: intent URL (installed app, Play Store only if it isn't installed).
 * iOS: the app's URL scheme only – no automatic App Store redirect (Safari's "Open in …?" prompt keeps the page
 * visible, so a timer would send people to the store right as they tap "Open"); the UI shows a download link.
 */
export function openBankApp(bank: BankApp, platform: MobilePlatform) {
  if (platform === "android") {
    window.location.href = androidIntentUrl(bank);
    return;
  }
  if (platform !== "ios") {
    window.open(bankStoreUrl(bank, platform), "_blank", "noopener");
    return;
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- external app scheme, not a page
  window.location.href = `${bank.scheme}://`;
}
