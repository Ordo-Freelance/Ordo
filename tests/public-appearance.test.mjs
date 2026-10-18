import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../JavaScript/public-appearance.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');

test('public pages receive separate solid and gradient backgrounds by mode',()=>{
  const values={};
  const styleFor=name=>({setProperty(key,value){values[name+key]=value;}});
  const body={style:styleFor('body')},html={style:styleFor('html')};
  let css;
  const document={
    body,documentElement:html,
    getElementById(){return css;},
    createElement(){css={id:'',textContent:''};return css;},
    head:{appendChild(){}}
  };
  const window={document};
  vm.runInNewContext(source,{window});
  const themes={
    dark:{toneColor:'#101b35',toneGradientEnd:'#243b60',toneStyle:'gradient',toneAngle:135},
    light:{toneColor:'#eef3ff',toneStyle:'solid'}
  };
  window.applyOrdoPublicAppearance({displayMode:'dark',appearanceThemes:themes});
  assert.match(values['body--public-page-bg'],/^linear-gradient\(135deg,/);
  window.applyOrdoPublicAppearance({displayMode:'light',appearanceThemes:themes});
  assert.equal(values['body--public-page-bg'],'#eef3ff');
  assert.match(css.textContent,/\.nav,\.ftr,footer/);
});

test('workspace stores a separate tone configuration for each display mode',()=>{
  assert.match(app,/S\.settings\.appearanceThemes\[mode\]=Object\.assign/);
  assert.match(app,/var modeTone=s\.appearanceThemes&&s\.appearanceThemes\[mode\]/);
});

test('public-facing pages load the shared owner appearance',()=>{
  for(const name of ['brief','store','review','reviews-public','proposal','contract']){
    const page=fs.readFileSync(new URL('../HTML/'+name+'.html',import.meta.url),'utf8');
    assert.match(page,/public-appearance\.js/);
    assert.match(page,/applyOrdoPublicAppearance/);
  }
});

test('review page keeps readable semantic surfaces and exports the displayed card',()=>{
  const page=fs.readFileSync(new URL('../HTML/review.html',import.meta.url),'utf8');
  assert.match(page,/--public-page-bg/);
  assert.match(page,/--public-surface/);
  assert.match(page,/document\.body\.style\]\.forEach/);
  const publicReviews=fs.readFileSync(new URL('../HTML/reviews-public.html',import.meta.url),'utf8');
  assert.match(publicReviews,/document\.body\.style\]\.forEach/);
  assert.match(publicReviews,/class="nav-links"/);
  assert.match(publicReviews,/id="nav-services"/);
  assert.match(publicReviews,/id="nav-work"/);
  assert.match(publicReviews,/class="hero-shell"/);
  assert.match(publicReviews,/id="hero-website"/);
  assert.match(publicReviews,/public_website_url/);
  assert.match(api,/public_website_url/);
  assert.doesNotMatch(publicReviews,/هوية مستقلة وتجارب شفافة/);
  assert.doesNotMatch(publicReviews,/تجارب حقيقية، ثقة أكبر/);
  assert.match(publicReviews,/storeUrl \+ "#_pf"/);
  const workspace=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
  assert.match(workspace,/id="svc-public-website-url"/);
  assert.match(workspace,/onclick="savePublicWebsiteUrl\(\)"/);
  assert.match(app,/function savePublicWebsiteUrl\(\)/);
  assert.match(app,/S\.settings\.public_website_url=url/);
  assert.match(portal,/id="_portal-review-marquee"/);
  assert.match(portal,/function _startPortalReviewAutoScroll\(\)/);
  assert.match(portal,/function _movePortalReviews\(direction\)/);
  assert.match(portal,/portal-review-arrow prev/);
  assert.match(portal,/portal-review-arrow next/);
  assert.match(app,/function _downloadReviewCardDom\(\)/);
  assert.match(app,/window\.html2canvas\(card/);
  assert.match(app,/canvas\.toBlob\(resolve,'image\/png',1\)/);
  assert.match(app,/ignoreElements:function\(el\)/);
  assert.match(app,/cloneNode\(true\)/);
  assert.match(app,/XMLSerializer/);
  assert.match(app,/dlBtn\.onclick=function\(\)\{ _downloadReviewCardDom\(\); \}/);
});
