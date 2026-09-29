import { expect, test, type Page } from '@playwright/test';

const owner = { id: 'owner-1', email: 'owner@clinic.test', name: 'Alex Owner', role: 'OWNER', permissions: [] };
const state = (step: string) => ({ organizationId: 'org-1', clinicName: 'Maple Veterinary', onboardingCompletedAt: step === 'COMPLETE' ? '2026-09-28' : null, step, pendingInvitationCount: 0, teamMemberCount: 1 });
async function signedIn(page: Page, role = 'OWNER') {
  await page.context().addCookies([{ name: 'sparki_session', value: 'browser-test', domain: '127.0.0.1', path: '/' }]);
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { user: { ...owner, role } } }));
  await page.route('**/api/auth/profile', (route) => route.fulfill({ json: { firstName: 'Alex', lastName: 'Owner', displayName: 'Alex Owner', phone: null, avatarUrl: null, statusEmoji: null, statusText: null } }));
  await page.route('**/api/clinic/billing', (route) => route.fulfill({ json: { subscriptionStatus: 'ACTIVE', isRestricted: false, currentPeriodEnd: null, planId: null } }));
}
async function fillSignup(page: Page) {
  await page.getByLabel('First name').fill('Alex');
  await page.getByLabel('Last name').fill('Owner');
  await page.getByLabel('Your email').fill('owner@clinic.test');
  await page.getByLabel('Business name').fill('Maple Veterinary');
}
const invite = (status: string, isOwnerFounding = false) => ({ email: 'person@clinic.test', role: isOwnerFounding ? 'OWNER' : 'TECHNICIAN', clinicName: 'Maple Veterinary', isOwnerFounding, status, expiresAt: '2026-10-01T00:00:00Z' });

test('public invitation states', async ({ page }) => {
  for (const [status, heading] of [['PENDING', 'You’ve been invited to Maple Veterinary'], ['EXPIRED', 'This invitation has expired.'], ['REVOKED', 'This invitation is no longer active.'], ['ACCEPTED', 'This invitation has already been used.']] as const) {
    await page.route('**/api/invitations/test-token', (route) => route.fulfill({ json: invite(status) }));
    await page.goto('/invite/test-token');
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.unroute('**/api/invitations/test-token');
  }
});

test('owner activation goes to setup', async ({ page }) => {
  await page.route('**/api/invitations/test-token', (route) => route.fulfill({ json: { ...invite('PENDING', true), suggestedFirstName: 'Alex', suggestedLastName: 'Owner' } }));
  await page.route('**/api/invitations/test-token/accept', (route) => route.fulfill({ status: 201, headers: { 'set-cookie': 'sparki_session=browser-test; Path=/; HttpOnly; SameSite=Lax' }, json: { user: owner } }));
  await page.goto('/invite/test-token');
  await expect(page.getByRole('heading', { name: 'Welcome to Sparki' })).toBeVisible();
  await expect(page.getByLabel('First name')).toHaveValue('Alex');
  await expect(page.getByLabel('Last name')).toHaveValue('Owner');
  await page.getByLabel('First name').fill('Alex'); await page.getByLabel('Last name').fill('Owner');
  await page.getByLabel('Password', { exact: true }).fill('password123'); await page.getByLabel('Confirm password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/setup$/);
});

test('setup uses backend step and preserves partial batch results', async ({ page }) => {
  await signedIn(page);
  let step = 'CLINIC_DETAILS';
  await page.route('**/api/clinic/onboarding-state', (route) => route.fulfill({ json: state(step) }));
  await page.route('**/api/clinic', (route) => route.request().method() === 'GET' ? route.fulfill({ json: { id: 'org-1', name: 'Maple Veterinary', phone: null, email: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, country: null, timezone: null, legalName: null, createdAt: '2026-09-01' } }) : (step = 'INVITE_TEAM', route.fulfill({ json: {} })));
  let batches = 0;
  await page.route('**/api/team/invitations/batch', (route) => { batches++; const rows = (route.request().postDataJSON() as { invitations: { email: string }[] }).invitations; return route.fulfill({ json: rows.map((row) => ({ email: row.email, success: batches > 1 || row.email !== 'bad@clinic.test', error: 'Email service unavailable' })) }); });
  await page.route('**/api/clinic/onboarding/complete', (route) => { step = 'COMPLETE'; return route.fulfill({ json: state(step) }); });
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Confirm your clinic details' })).toBeVisible();
  await page.getByLabel('Phone').fill('555-0100'); await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  await page.getByLabel('Email').first().fill('good@clinic.test');
  await page.getByRole('button', { name: '+ Add another team member' }).click();
  await page.getByLabel('Email').last().fill('bad@clinic.test');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('✓ Invitation sent')).toHaveCount(1);
  await expect(page.getByText('Invitation could not be sent. Check this row and try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText('✓ Invitation sent')).toHaveCount(2);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page.getByRole('heading', { name: 'You’re ready to use Sparki' })).toBeVisible();
});

test('team tab is role aware and displays members and pending invites', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/team/members', (route) => route.fulfill({ json: [{ membershipId: 'm-1', userId: 'owner-1', firstName: 'Alex', lastName: 'Owner', displayName: 'Alex Owner', email: 'owner@clinic.test', role: 'OWNER', status: 'ACTIVE', createdAt: '2026-09-01' }] }));
  await page.route('**/api/team/invitations', (route) => route.fulfill({ json: [{ id: 'i-1', email: 'new@clinic.test', role: 'TECHNICIAN', status: 'PENDING', expiresAt: '2026-10-01', createdAt: '2026-09-28', invitedByUserId: 'owner-1' }] }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(page.getByText('Alex Owner').first()).toBeVisible(); await expect(page.getByText('new@clinic.test')).toBeVisible();
});

test('canceled subscription restricts the app', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/clinic/billing', (route) => route.fulfill({ json: { subscriptionStatus: 'CANCELED', isRestricted: true, currentPeriodEnd: null, planId: null } }));
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/billing-required$/);
  await expect(page.getByRole('heading', { name: 'Your Sparki subscription has ended.' })).toBeVisible();
});

test('staff acceptance enters Today', async ({ page }) => {
  await page.route('**/api/invitations/staff-token', (route) => route.fulfill({ json: invite('PENDING') }));
  await page.route('**/api/invitations/staff-token/accept', (route) => route.fulfill({ status: 201, headers: { 'set-cookie': 'sparki_session=browser-test; Path=/; HttpOnly; SameSite=Lax' }, json: { user: { ...owner, role: 'TECHNICIAN' } } }));
  await page.goto('/invite/staff-token');
  await page.getByLabel('First name').fill('Sam'); await page.getByLabel('Last name').fill('Tech');
  await page.getByLabel('Password', { exact: true }).fill('password123'); await page.getByLabel('Confirm password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('setup allows skipping team invitations', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/clinic/onboarding-state', (route) => route.fulfill({ json: state('INVITE_TEAM') }));
  await page.route('**/api/clinic/onboarding/complete', (route) => route.fulfill({ json: state('COMPLETE') }));
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'You’re ready to use Sparki' })).toBeVisible();
});

test('team invitation, resend, revoke, role and disable actions', async ({ page }) => {
  await signedIn(page);
  const member = { membershipId: 'm-tech', userId: 'tech-1', firstName: 'Sam', lastName: 'Tech', displayName: 'Sam Tech', email: 'sam@clinic.test', role: 'TECHNICIAN', status: 'ACTIVE', createdAt: '2026-09-01' };
  await page.route('**/api/team/members', (route) => route.fulfill({ json: [member] }));
  await page.route('**/api/team/invitations', (route) => route.request().method() === 'GET' ? route.fulfill({ json: [{ id: 'i-1', email: 'new@clinic.test', role: 'TECHNICIAN', status: 'PENDING', expiresAt: '2026-10-01', createdAt: '2026-09-28', invitedByUserId: 'owner-1' }] }) : route.fulfill({ status: 201, json: {} }));
  for (const path of ['**/api/team/invitations/i-1/resend', '**/api/team/invitations/i-1', '**/api/team/members/m-tech/role', '**/api/team/members/m-tech/disable']) await page.route(path, (route) => route.fulfill({ json: {} }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByLabel('Role for Sam Tech').selectOption('VETERINARIAN'); await expect(page.getByText('Role updated.')).toBeVisible();
  await page.getByRole('button', { name: 'Disable' }).click(); await expect(page.getByText('Team member disabled.')).toBeVisible();
  await page.getByRole('button', { name: 'Resend' }).click(); await expect(page.getByText('Invitation resent.')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: 'Revoke' }).click(); await expect(page.getByText('Invitation revoked.')).toBeVisible();
  await page.getByLabel('Email').fill('another@clinic.test'); await page.getByRole('button', { name: 'Send invitation' }).click(); await expect(page.getByText('Invitation sent.')).toBeVisible();
});

test('non-manager has no Team tab', async ({ page }) => {
  await signedIn(page, 'TECHNICIAN');
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Team', exact: true })).toHaveCount(0);
});

test('pending checkout waits for provisioned state', async ({ page }) => {
  let checks = 0;
  await page.route('**/api/billing/checkout-sessions/session-1/status', (route) => route.fulfill({ json: { status: ++checks === 1 ? 'pending' : 'provisioned', businessName: 'Maple Veterinary' } }));
  await page.goto('/setup/pending?session_id=session-1');
  await expect(page.getByRole('heading', { name: 'Setting up Maple Veterinary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maple Veterinary is ready.' })).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sign in/ })).toHaveCount(0);
});

test('checkout with an unsent activation email offers recovery', async ({ page }) => {
  await page.route('**/api/billing/checkout-sessions/session-2/status', (route) => route.fulfill({ json: { status: 'activation_required', businessName: 'Maple Veterinary' } }));
  await page.route('**/api/billing/checkout-sessions/session-2/resend-activation', (route) => route.fulfill({ status: 201, json: { sent: true } }));
  await page.goto('/setup/pending?session_id=session-2');
  await expect(page.getByRole('heading', { name: 'Send your setup link' })).toBeVisible();
  await page.getByRole('button', { name: 'Send setup link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('past due remains usable and suspended and pending are restricted', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/clinic/billing', (route) => route.fulfill({ json: { subscriptionStatus: 'PAST_DUE', isRestricted: false, currentPeriodEnd: null, planId: null } }));
  await page.goto('/settings'); await expect(page.getByText('There’s an issue with your Sparki subscription payment.')).toBeVisible();
  for (const [status, heading] of [['SUSPENDED', 'Your Sparki account is currently suspended.'], ['PENDING', 'We’re confirming your Sparki subscription.']] as const) {
    await page.unroute('**/api/clinic/billing');
    await page.route('**/api/clinic/billing', (route) => route.fulfill({ json: { subscriptionStatus: status, isRestricted: true, currentPeriodEnd: null, planId: null } }));
    await page.goto('/settings'); await expect(page).toHaveURL(/\/billing-required$/); await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
});

test('last owner conflict is explained without changing the row', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/team/members', (route) => route.fulfill({ json: [{ membershipId: 'm-other', userId: 'other-1', firstName: 'Pat', lastName: 'Owner', displayName: 'Pat Owner', email: 'pat@clinic.test', role: 'OWNER', status: 'ACTIVE', createdAt: '2026-09-01' }] }));
  await page.route('**/api/team/invitations', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/team/members/m-other/disable', (route) => route.fulfill({ status: 409, json: { statusCode: 409, message: 'A clinic must always have at least one active owner.' } }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Disable' }).click();
  await expect(page.locator('.team-section .form-error')).toHaveText('Your clinic must always have at least one active owner.');
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
});

test('disabled member can be re-enabled', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/team/members', (route) => route.fulfill({ json: [{ membershipId: 'm-other', userId: 'other-1', firstName: 'Sam', lastName: 'Tech', displayName: 'Sam Tech', email: 'sam@clinic.test', role: 'TECHNICIAN', status: 'DISABLED', createdAt: '2026-09-01' }] }));
  await page.route('**/api/team/invitations', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/team/members/m-other/enable', (route) => route.fulfill({ json: {} }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Re-enable' }).click();
  await expect(page.getByText('Team member re-enabled.')).toBeVisible();
});

test('exact subscription 402 from a protected API routes to billing state', async ({ page }) => {
  await signedIn(page);
  await page.route('**/api/team/members', (route) => route.fulfill({ status: 402, json: { code: 'SUBSCRIPTION_INACTIVE', subscriptionStatus: 'SUSPENDED' } }));
  await page.route('**/api/team/invitations', (route) => route.fulfill({ json: [] }));
  await page.goto('/settings'); await page.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(page).toHaveURL(/\/billing-required$/);
});

test('pricing collects owner and practice details without accepting a price ID', async ({ page }) => {
  let submitted: unknown;
  await page.route('**/api/billing/checkout-sessions', (route) => { submitted = route.request().postDataJSON(); return route.fulfill({ json: { checkoutUrl: 'https://checkout.stripe.com/c/pay/test' } }); });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Secure checkout</h1>' }));
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: /Simple pricing for veterinary teams/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sparki plan' })).toBeVisible();
  await expect(page.getByText('Free during early access')).toBeVisible();
  await expect(page.getByText('$0')).toBeVisible();
  await expect(page.getByLabel('Your email')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start free' }).click();
  await expect(page.getByRole('heading', { name: /Let’s get to know your practice/ })).toBeVisible();
  await expect(page.getByText('$0 today')).toBeVisible();
  await fillSignup(page);
  await page.getByLabel('Business phone').pressSequentially('2068527142');
  await expect(page.getByLabel('Business phone')).toHaveValue('(206) 852-7142');
  await page.getByLabel('Team size').selectOption('6-10');
  await page.getByLabel('Practice contact email').fill('hello@maplevet.test');
  await page.getByLabel('Street address').fill('12 Maple Street');
  await page.getByLabel('City').fill('Madison');
  await page.getByLabel('State').fill('WI');
  await page.getByLabel('ZIP code').fill('53703');
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click();
  await expect.poll(() => submitted).toEqual(expect.objectContaining({ email: 'owner@clinic.test', plan: 'STANDARD', ownerFirstName: 'Alex', ownerLastName: 'Owner', businessName: 'Maple Veterinary', businessPhone: '(206) 852-7142', businessEmail: 'hello@maplevet.test', teamSize: '6-10', addressLine1: '12 Maple Street', city: 'Madison', state: 'WI', postalCode: '53703' }));
  await expect(page).toHaveURL('https://checkout.stripe.com/c/pay/test');
});

test('pricing ignores a client-supplied price ID', async ({ page }) => {
  let submitted: unknown;
  await page.route('**/api/billing/checkout-sessions', (route) => { submitted = route.request().postDataJSON(); return route.fulfill({ json: { checkoutUrl: 'https://checkout.stripe.com/c/pay/test' } }); });
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Secure checkout</h1>' }));
  await page.goto('/pricing?price_id=price_test_untrusted');
  await page.getByRole('button', { name: 'Start free' }).click();
  await fillSignup(page);
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click();
  await expect.poll(() => submitted).toEqual(expect.objectContaining({ email: 'owner@clinic.test', plan: 'STANDARD', businessName: 'Maple Veterinary' }));
  expect(submitted).not.toHaveProperty('priceId');
});

test('pricing keeps email validation and offers retry after checkout error', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/billing/checkout-sessions', (route) => { requests++; return route.fulfill({ status: 503, json: { message: 'Unavailable' } }); });
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Start free' }).click();
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click();
  expect(requests).toBe(0);
  await fillSignup(page);
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click();
  await expect(page.getByText('We couldn’t start checkout. Please try again or contact Sparki support.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to secure checkout' })).toBeEnabled();
  expect(requests).toBe(1);
});

test('pricing explains when checkout is not configured', async ({ page }) => {
  await page.route('**/api/billing/checkout-sessions', (route) => route.fulfill({
    status: 503,
    json: { code: 'BILLING_NOT_CONFIGURED', message: 'Checkout is temporarily unavailable.' },
  }));
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Start free' }).click();
  await fillSignup(page);
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click();
  await expect(page.getByRole('region', { name: 'Checkout details' }).getByRole('alert')).toHaveText('Checkout is temporarily unavailable. Please contact Sparki support.');
});

test('pricing pauses checkout when account email cannot be sent', async ({ page }) => {
  await page.route('**/api/billing/checkout-sessions', (route) => route.fulfill({
    status: 503,
    json: { code: 'EMAIL_UNAVAILABLE', message: 'Account setup email is unavailable.' },
  }));
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Start free' }).click();
  await fillSignup(page);
  await page.getByRole('button', { name: 'Continue to secure checkout' }).click();
  await expect(page.getByRole('region', { name: 'Checkout details' }).getByRole('alert')).toHaveText('Account setup email is temporarily unavailable. Please try again shortly.');
});

for (const width of [320, 390]) {
  test(`pricing and checkout fit a ${width}px mobile viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.goto('/pricing');
    await expect(page.getByRole('button', { name: 'Start free' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('button', { name: 'Start free' }).click();
    await expect(page.getByLabel('Your email')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('invalid invitation and unknown checkout links recover clearly', async ({ page }) => {
  await page.route('**/api/invitations/unknown', (route) => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await page.goto('/invite/unknown');
  await expect(page.getByRole('heading', { name: 'This invitation link isn’t valid.' })).toBeVisible();
  await page.route('**/api/billing/checkout-sessions/unknown/status', (route) => route.fulfill({ status: 404, json: { message: 'Not Found' } }));
  await page.goto('/setup/pending?session_id=unknown');
  await expect(page.getByRole('heading', { name: 'Let’s find your way back.' })).toBeVisible();
});

test('registered email and expired acceptance show useful invitation recovery', async ({ page }) => {
  await page.route('**/api/invitations/test-token', (route) => route.fulfill({ json: invite('PENDING') }));
  let outcome: 'registered' | 'expired' = 'registered';
  await page.route('**/api/invitations/test-token/accept', (route) => route.fulfill(outcome === 'registered' ? { status: 409, json: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Already registered' } } : { status: 410, json: { message: 'This invitation has expired.' } }));
  await page.goto('/invite/test-token');
  const fill = async () => { await page.getByLabel('First name').fill('Sam'); await page.getByLabel('Last name').fill('Tech'); await page.getByLabel('Password', { exact: true }).fill('password123'); await page.getByLabel('Confirm password').fill('password123'); await page.getByRole('button', { name: 'Create account' }).click(); };
  await fill();
  await expect(page.getByText('This email already has a Sparki account.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  outcome = 'expired';
  await fill();
  await expect(page.getByText('This invitation has expired.')).toBeVisible();
});
