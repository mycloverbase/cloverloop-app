---
title: "Razorpay Troubleshooting"
slug: "razorpay-troubleshooting"
category: "razorpay-setup"
order: 16
description: "Use the relevant provider's dashboard to identify whether an issue concerns merchant onboarding, payment processing, settlement or CloverLoop's order records."
status: "published"
lastUpdated: "2026-11-01"
related: []
editorialLabel: "GENERAL TROUBLESHOOTING"
---

Use the relevant provider's dashboard to identify whether an issue concerns merchant onboarding, payment processing, settlement or CloverLoop's order records.

## Account registration or KYC is not progressing

Check status and pending actions in the Razorpay Dashboard. Confirm submitted details are accurate and respond to requests for additional information. Contact Razorpay for account verification issues.

## Razorpay account is not activated

Review account activation status and any restrictions shown by Razorpay. CloverLoop cannot approve a Razorpay merchant account on Razorpay's behalf.

## Cannot connect Razorpay to CloverLoop

Confirm you are using the correct Razorpay account and that it is eligible for the required services. Retry the official connection flow. If the issue persists, contact CloverLoop with non-sensitive error details.

## Payment succeeded but the order is not confirmed

Do not ask the customer to pay again immediately. Check the order status in CloverLoop and corresponding payment record in Razorpay. Contact CloverLoop with the order and payment references, but never share passwords, OTPs or secret keys.

## Payment failed

Ask the customer to check the payment status with their bank or payment provider. Check the transaction status in Razorpay before attempting another payment.

## Settlement is missing or differs from the payment

Review settlement and transaction records in Razorpay, including fees, taxes, refunds and adjustments. Contact Razorpay about settlement ledger or bank-credit issues. Contact CloverLoop if the discrepancy concerns the order record or platform display.
