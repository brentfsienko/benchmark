## Security Regression Checklist

Run this checklist before release when touching auth/authz or API routes.

### Authz / Object-level access

- [ ] Signed-in user can update only their own profile.
- [ ] Signed-in user gets `403` when updating another user's profile.
- [ ] Signed-in user can update only their own wishlist/onboarding.
- [ ] Signed-in user cannot spoof follow/unfollow as another user.
- [ ] Signed-in user cannot spoof challenge join/progress as another user.
- [ ] Signed-in user cannot spoof report or event actor identity.

### Admin-only surfaces

- [ ] Non-admin receives `403` on feature-flag `PUT`.
- [ ] Admin can still create/move benches.

### Profile privacy contract

- [ ] Private profile returns `403` to non-owner/non-admin.
- [ ] Public profile to non-owner does not expose wishlist IDs, benchmarked IDs, or avatar base64 payload.
- [ ] Owner/admin still receives full profile payload.

### Input validation

- [ ] Review rating out of range fails with `422`.
- [ ] Oversized review note fails with `422`.
- [ ] Too many/oversized review photos fail with `422`.
- [ ] Invalid report `targetType` fails with `422`.
- [ ] Oversized report reason fails with `422`.
- [ ] Invalid event source fails with `422`.
- [ ] Oversized event metadata fails with `422`.

## RLS-first Migration Path (Recommended)

Current API handlers use service-role DB access and enforce authz in route code.

Target model:

1. Add row-level security policies for user-owned tables (`users`, `wishlist_items`, `bench_reviews`, `challenge_participants`, `content_reports`, `product_events`).
2. Move self-service endpoints from service-role client to request-scoped Supabase auth client.
3. Keep service-role only for true admin workflows.
4. Add integration tests proving policy enforcement across users.
