/**
 * Single source of truth for the displayed credit balance.
 *
 * authStore initialises `credits` to 0 before the profile row loads. Callers
 * that treat that placeholder as a real balance show "out of credits" and
 * block sessions even when the user still has an allotment.
 */
export function resolveCreditBalance(input: {
  isProfileLoaded?: boolean;
  profileCredits?: number | null;
  storeCredits?: number | null;
}): { balance: number; known: boolean } {
  const profile =
    typeof input.profileCredits === "number" && Number.isFinite(input.profileCredits)
      ? input.profileCredits
      : null;
  const store =
    typeof input.storeCredits === "number" && Number.isFinite(input.storeCredits)
      ? input.storeCredits
      : null;

  if (!input.isProfileLoaded && profile === null) {
    return { balance: 0, known: false };
  }

  if (profile !== null && store !== null) {
    // Trust the profile row while the store still looks like the pre-fetch 0.
    if (store === 0 && profile > 0) {
      return { balance: profile, known: true };
    }
    return { balance: store, known: true };
  }

  if (profile !== null) {
    return { balance: profile, known: true };
  }

  if (store !== null) {
    return { balance: store, known: true };
  }

  return { balance: 0, known: Boolean(input.isProfileLoaded) };
}
