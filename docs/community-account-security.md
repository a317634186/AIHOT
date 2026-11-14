# Community account recovery

Members can generate eight one-time recovery codes from Community → Account → Account security after entering their current password. Only hashes are stored; the codes are displayed once. Creating a new set invalidates the previous set. A successful reset invalidates every existing session and all remaining codes, so the member should sign in and create a fresh set. Password changes have the same effect.

Email recovery is available only when both `SMTP_URL` and `MAIL_FROM` are configured in the existing server-side integrations credentials or environment. The address must already be on the account; it is not verified at registration. A reset email proves control of that address for the reset only. Links expire after 30 minutes and are single-use. Configure a sending provider and authenticated sender before enabling mail. Do not put credentials in source control or client-side code.

Members who lost their password before saving recovery codes, and who cannot receive a reset email at the address already on the account, cannot use these automated methods. Do not bypass identity verification to transfer an account. Codes and passwords must not be requested through feedback.

Recovery endpoints use persistent per-identity and per-IP throttles. The daily community security cleanup removes expired reset records and old throttle windows. Tests use an isolated database and a local mail stub, not a real recipient.
