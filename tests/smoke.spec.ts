import { test, expect } from '@grafana/plugin-e2e';

test('smoke: grafana loads and plugin is registered', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Grafana/);

  await page.goto('/plugins/sdague-ibmlogs-datasource');
  await expect(page.getByRole('heading', { name: 'IBM Logs Datasource' }).first()).toBeVisible();
});
