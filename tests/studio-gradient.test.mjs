import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');

test('background picker controls both gradient colors and direction',()=>{
  for(const id of ['studio-tone-color','studio-tone-end','studio-tone-style','studio-tone-angle','studio-tone-preview'])assert.match(app,new RegExp(id));
  assert.match(app,/linear-gradient\('\+toneAngle\+'deg, '\+tone\+', '\+toneEnd\+'\)/);
  assert.match(app,/S\.settings\.toneStyle=style;S\.settings\.toneGradientEnd=end;S\.settings\.toneAngle=angle/);
});

test('personalized background overrides the body-local default without repeating on pages',()=>{
  assert.match(app,/document\.body\.style\.setProperty\('--bg', tone\)/);
  assert.match(css,/body\.app-loaded\.studio-toned:not\(\.pub-page\)\{\s*background:var\(--studio-page-background,var\(--bg\)\) fixed!important/);
  assert.match(css,/body\.app-loaded\.studio-toned:not\(\.pub-page\) \.page,[\s\S]*?background:transparent!important/);
});
