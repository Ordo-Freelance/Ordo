import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../JavaScript/public-appearance.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');

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
