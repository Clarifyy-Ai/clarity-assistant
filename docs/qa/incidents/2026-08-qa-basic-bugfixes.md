# QA Bug Fix Notes — Auth Email Branding (BUG-06 / QA-040)

## Interpretation
Forgot-password and signup confirmation emails are sent by **Supabase Auth**, not the app’s Resend `send-email` edge function. That is intentional for credential flows (tokens must come from Auth).

## Expected vs product
- **Security emails** (reset password, confirm email, magic link): Supabase Auth templates + SMTP.
- **Transactional product emails** (welcome, billing, referrals): Resend via `send-email`.

## To brand Auth emails (ops, not code)
1. Supabase Dashboard → **Project Settings → Authentication → Email Templates**.
2. Customize “Reset Password” HTML with Clarify branding and a clear **Reset Password** CTA button using `{{ .ConfirmationURL }}`.
3. (Recommended) Authentication → **SMTP Settings** → configure Resend SMTP so From: is `noreply@yourdomain` instead of the default Supabase sender.
4. Authentication → URL Configuration: Site URL = `https://clarify.ai.sltfinanceindia.com`, Redirect URLs include `https://clarify.ai.sltfinanceindia.com/reset-password` and `…/auth/callback`.

## App-side fix shipped
- `redirectTo` now prefers `VITE_APP_URL` so preview/localhost origins do not poison reset links (BUG-02).
