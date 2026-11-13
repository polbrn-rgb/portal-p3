import { expect, test } from '@playwright/test';

test('tela inicial abre sem erros e sem rolagem lateral', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Portal P3', level: 1 })).toBeVisible();

  const sobraLateral = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(sobraLateral).toBeLessThanOrEqual(0);
  expect(erros).toEqual([]);
});
