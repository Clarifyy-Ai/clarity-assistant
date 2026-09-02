/** Shared email-confirmation helpers for Edge Functions. */

export function isEmailConfirmedAt(
  value: string | null | undefined,
): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAuthUserEmailConfirmed(
  user: { email_confirmed_at?: string | null },
): boolean {
  return isEmailConfirmedAt(user.email_confirmed_at);
}

export function emailNotVerifiedResponse(
  corsHeaders: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      error:
        "Email address not verified. Check your inbox for the confirmation link.",
      code: "EMAIL_NOT_VERIFIED",
    }),
    {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
