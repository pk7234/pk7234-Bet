# Firestore Security Specification - Aviator Pro

## 1. Data Invariants
- A user document must exist for every authenticated user.
- A user's balance cannot be negative.
- Only admins can modify other users' roles or approve transactions.
- Transactions must have a valid `userId` matching the requester (or admin).
- Transaction `status` can only move from `pending` to `approved` or `rejected`.
- `phoneNumber` is required for new signups.

## 2. The "Dirty Dozen" Payloads (Denial Tests)
1. **Identity Spoofing**: Attempt to create a transaction with someone else's `userId`.
2. **Privilege Escalation**: Attempt to set `role: 'admin'` during signup.
3. **Ghost Fields**: Add `isVerified: true` to a user profile update.
4. **Negative Balance**: Set `balance: -1000` via client side.
5. **Direct Approval**: Update transaction status to `approved` as a regular user.
6. **Orphaned Write**: Create a transaction without the required `screenshotUrl`.
7. **Resource Poisoning**: Use a 2KB string as a `transactionId`.
8. **PII Breach**: Read another user's `phoneNumber` without permission.
9. **History Manipulation**: Directly modify the `history` collection (if it existed as a root collection).
10. **State Skipping**: Change transaction from `rejected` back to `pending`.
11. **Massive Field**: Add a 1MB string to the `email` field.
12. **Unauthorized Metadata**: Change `createdAt` of a user profile.

## 3. Test Runner Concept
The `firestore.rules` will enforce these by:
- Checking `request.auth.uid == userId`.
- Using `affectedKeys().hasOnly()` for specific actions.
- Validating string sizes and formats.
- Using `exists()` to verify related resources.
