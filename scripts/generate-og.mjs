// Render the code-owned SVG at the standard social preview size. Requires Playwright Chromium.
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.setContent(`<style>html,body{margin:0;width:1200px;height:630px}</style>${await fs.readFile('frontend/public/og.svg','utf8')}`);
  await page.screenshot({path:'frontend/public/og.png'});
} finally {await browser.close();}
