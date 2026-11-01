---
title: "How to Connect Razorpay to CloverLoop"
slug: "how-to-connect-razorpay-to-cloverloop"
category: "razorpay-setup"
order: 14
description: "Connecting Razorpay allows CloverLoop to use the creator's own payment account for eligible customer transactions. Make sure your Razorpay account has completed the activation steps required for the relevant payment services."
status: "published"
lastUpdated: "2026-11-01"
related: []
reviewNote: "Final button names, permission descriptions, callback behaviour, reconnection and disconnection instructions must be verified against the production integration before publication."
---

Connecting Razorpay allows CloverLoop to use the creator's own payment account for eligible customer transactions. Make sure your Razorpay account has completed the activation steps required for the relevant payment services.

## Before you begin

Have access to the Razorpay account that belongs to you or the business operating your creator storefront. Confirm that the account is active for the required payment services.

## Connection process

Open the payment settings in CloverLoop and follow the connection method actually provided in the live interface. If CloverLoop uses an authorised Razorpay OAuth flow, you will be redirected to Razorpay to review and approve the requested access, then returned to CloverLoop. If a different approved mechanism is implemented, follow the instructions shown in CloverLoop.

## Confirm the connection

After completing the flow, check the payment settings in CloverLoop for the actual connected-account status. Do not rely only on a successful redirect.

## Security

Never share your Razorpay password, one-time password or secret credentials with another person. Do not send secret API keys through email or chat. Use only the official connection flow provided by CloverLoop.

## If connection fails

Check that you signed in to the correct Razorpay account, that the account is active and that you completed the authorisation steps. Record the error message and contact CloverLoop support if the connection still fails.
