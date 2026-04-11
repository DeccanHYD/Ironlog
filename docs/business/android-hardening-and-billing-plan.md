# Android Hardening and Billing Plan

This document is the practical anti-piracy and monetization hardening plan for IRONLOG.

The goal is not fantasy "perfect crack-proofing." The goal is to make entitlement abuse difficult enough that casual piracy stops being easy and maintaining a cracked build becomes painful.

## 1. What attackers usually target

Paid Android apps are commonly attacked through a few broad paths:

- patched APKs that bypass client-side premium checks
- repackaged builds signed with a different key
- hooked runtime behavior on rooted or instrumented devices
- fake billing success paths when the app trusts the client too much
- static extraction of secrets from the APK
- offline premium flags stored too simply in local storage

For a local-first app, the biggest risk is trusting the device too much for entitlement decisions.

## 2. Core rule

Do not treat client-side purchase state as the ultimate source of truth.

The app can cache entitlement locally for UX, but the authoritative premium state should eventually be validated outside the client.

## 3. Recommended architecture

### Phase 1: launch before monetization

- ship the app free
- collect quality, retention, and crash data
- finish core release hardening

### Phase 2: add a Pro unlock

- use Google Play Billing for one-time purchase
- add Play Integrity API checks
- add release-only entitlement enforcement
- add premium gating in multiple product layers

### Phase 3: add backend verification

- verify purchase tokens server-side
- issue app entitlement state from backend
- re-check periodically
- invalidate obviously compromised states

## 4. Play Billing implementation rules

- one-time product should unlock `IRONLOG Pro`
- never unlock permanently based only on a local callback
- verify purchase token and purchase state
- acknowledge purchases correctly
- restore purchases properly

## 5. Play Integrity implementation rules

- require integrity signals on premium-sensitive flows
- use integrity as one signal, not the only signal
- use it to increase friction on tampered, rooted, automated, or repackaged environments

## 6. Client-side hardening

- enable R8 / ProGuard aggressively for release
- remove debug leftovers from production builds
- avoid obvious single premium booleans in plain storage
- split premium checks across UI, navigation, and feature service layers
- avoid shipping secrets in the client
- detect release signature mismatches
- reduce log verbosity in release builds

## 7. Entitlement design

Bad pattern:

- `if (storedFlag === true) premium = true`

Better pattern:

- billing purchase exists
- purchase verified
- integrity signal acceptable
- release signature valid
- entitlement cached with expiry and revalidation rules

## 8. Product gating strategy

Free tier should remain useful.

Pro tier should cover:

- advanced analytics
- recovery maps and premium readiness tools
- deeper export/backup features
- premium intelligence modules
- future advanced program tooling

Do not gate the entire app behind a first-launch wall.

## 9. One-time purchase recommendation

Start with:

- `USD 9.99` default

Reasonable testing range:

- `USD 7.99`
- `USD 9.99`
- `USD 12.99`

## 10. What not to do

- do not wait for impossible perfect crack-proofing
- do not rely only on obfuscation
- do not hide all premium logic in one place
- do not trust rooted/instrumented clients blindly
- do not ship monetization with weak entitlement logic

## 11. Security references to follow

Use these as the primary technical references:

- Android Play Billing documentation
- Android Play Integrity documentation
- OWASP MASVS / MSTG for mobile app hardening guidance

## 12. Recommended sequence for IRONLOG

1. finish launch stabilization
2. publish free app
3. collect initial retention and review signals
4. implement Play Billing + Play Integrity + entitlement architecture
5. enable one-time Pro unlock once the product baseline is stable
