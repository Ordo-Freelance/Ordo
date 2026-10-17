import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseBehanceMetadata, validatedBehanceUrl, behanceProjectId, behanceCoverFromEmbed } from '../api/index.js';

const appSource=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const htmlSource=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const portalSource=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');
const storeSource=fs.readFileSync(new URL('../HTML/store.html',import.meta.url),'utf8');

test('Behance importer only permits HTTPS Behance pages',()=>{
  const target=validatedBehanceUrl('https://www.behance.net/gallery/123/Test');
  assert.equal(target?.hostname,'www.behance.net');
  assert.equal(behanceProjectId(target),'123');
  assert.equal(validatedBehanceUrl('http://www.behance.net/gallery/123/Test'),null);
  assert.equal(validatedBehanceUrl('https://behance.net.evil.test/gallery/123'),null);
  assert.equal(validatedBehanceUrl('https://127.0.0.1/gallery/123'),null);
});

test('Behance embed page yields the official project cover',()=>{
  const html='<img alt="Project Cover: Test" srcset="https://mir-s3-cdn-cf.behance.net/projects/404_webp/cover.jpg 404w, https://mir-s3-cdn-cf.behance.net/projects/max_808_webp/cover.jpg 808w">';
  assert.equal(behanceCoverFromEmbed(html),'https://mir-s3-cdn-cf.behance.net/projects/max_808_webp/cover.jpg');
});

test('Behance Open Graph metadata fills the portfolio project',()=>{
  const html=`<meta property="og:title" content="Brand Identity — Behance"><meta name="description" content="Project details"><meta property="og:image" content="/cover.jpg">`;
  assert.deepEqual(parseBehanceMetadata(html,'https://www.behance.net/gallery/123/Test'),{
    title:'Brand Identity',description:'Project details',thumbnail:'https://www.behance.net/cover.jpg',url:'https://www.behance.net/gallery/123/Test',provider:'behance'
  });
  assert.match(htmlSource,/id="pf-behance-import-btn"/);
  assert.match(appSource,/function importBehancePortfolio\(\)/);
  assert.match(appSource,/_pfThumbData=project\.thumbnail/);
});

test('saved portfolio projects remain visible in both portal and store',()=>{
  assert.match(portalSource,/portfolio_projects\|\|\[\]/);
  assert.match(storeSource,/portfolio_projects\|\|\[\]/);
  assert.match(portalSource,/p\.thumb\|\|p\.image/);
  assert.match(storeSource,/p\.thumb\|\|p\.image/);
  assert.match(portalSource,/class="pf-title">\$\{xe\(title\)\}/);
  assert.match(portalSource,/class="pf-cat">\$\{xe\(cat\)\}/);
  assert.match(portalSource,/عرض المشروع/);
  assert.match(portalSource,/store-sec \.svc-grid,\.store-sec \.pf-grid\{display:flex;overflow-x:auto/);
  assert.match(portalSource,/>عرض المزيد<\/span>/);
  assert.match(portalSource,/location\.origin\+'\/store\/'\+encodeURIComponent\(slug\)/);
  assert.match(portalSource,/id="_portal-pf-marquee" data-auto-loop=/);
  assert.match(portalSource,/function _startPortalPortfolioAutoScroll\(\)/);
  assert.match(portalSource,/rail\.scrollLeft\+=\(now-last\)\*0\.028/);
  assert.match(portalSource,/\.store-sec\{margin-top:72px\}/);
  assert.match(storeSource,/class="_pf-title"/);
  assert.match(storeSource,/class="_pf-cat"/);
  assert.match(storeSource,/class="_pf-link"><span>عرض المشروع/);
  assert.match(storeSource,/if\(window\.applyOrdoPublicAppearance\)window\.applyOrdoPublicAppearance\(settings\)/);
});
