import { expect, test } from '@playwright/test';
import { loadFixture, shooter } from '../support/fixtures';
import type { Fixture } from '../support/personas';

let fixture: Fixture;

test.beforeAll(() => {
  fixture = loadFixture();
});

test('the owner signs in and sees the school and campus switchers', async ({
  page,
}, testInfo) => {
  const shot = shooter(page, testInfo.project.name);
  const { owner } = fixture.personas;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await shot('sign-in-form');

  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password').fill(owner.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('School')).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('Campus')).toBeVisible();
  await shot('signed-in');
});
