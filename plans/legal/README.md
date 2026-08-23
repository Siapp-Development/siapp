---
title: "Siapp — Legal Document Sources"
status: in-review
updated: 2026-08-22
---

# Legal Document Sources

Public-facing legal content for Siapp. These markdown files are the **source of truth**
for the rendered legal pages in the marketing app (issue #100). Counsel review is still
recommended before relying on them for regulated purposes — see
[../../pm_ux/plans/14-legal-compliance.md](../../pm_ux/plans/14-legal-compliance.md).
BM/EN bilingual versions are deferred to a later release; these are EN.

| File | Purpose | Route |
|---|---|---|
| [privacy-policy.md](./privacy-policy.md) | PDPA privacy policy; includes mobile non-sharing, message frequency, and "message and data rates may apply" disclosures. | `/privacy` |
| [terms-and-conditions.md](./terms-and-conditions.md) | Platform Terms & Conditions for firms and users. | `/terms` |
| [campaign-privacy-policy.md](./campaign-privacy-policy.md) | Messaging campaign privacy policy for **Twilio phone number / A2P registration**. | `/legal/campaign-privacy` |
| [sms-messaging-terms.md](./sms-messaging-terms.md) | SMS/WhatsApp program **Terms page for the Twilio phone number** (STOP/HELP, frequency, rates). | `/legal/sms-terms` |

## Twilio campaign registration checklist

- [x] Privacy Policy states mobile numbers are **not shared/sold** to third parties for marketing.
- [x] Privacy Policy notes **message frequency** varies.
- [x] Privacy Policy includes **"Message and data rates may apply."**
- [x] **STOP** (opt-out) and **HELP** instructions documented in the messaging terms.
- [x] Opt-in / consent flow described (consent not a condition of purchase).
- [ ] Both pages hosted at stable public URLs and linked in the campaign submission (after deploy).
