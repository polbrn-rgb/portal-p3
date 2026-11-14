import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({ ...base, testDir: 'capturas-e2e', projects: [{ name: 'chromium', use: { browserName: 'chromium' } }], retries: 0 });
