import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const cloudThemeSource = app.slice(app.indexOf('function _loadThemeFromCloud(){'), app.indexOf('// PLATFORM NAME', app.indexOf('function _loadThemeFromCloud(){')));
const modeSource = app.slice(app.indexOf('function setDisplayMode(mode, persist = true) {'), app.indexOf('function setThemeColor(', app.indexOf('function setDisplayMode(mode, persist = true) {')));

test('locally chosen dark mode wins over an older light setting from cloud', () => {
  const values = new Map([['studioDisplayMode','dark'],['studioAccentColor','#123456']]);
  const calls = [];
  const context = {
    S:{settings:{displayMode:'light',accentColor:'#abcdef'}},
    localStorage:{getItem:key=>values.get(key) || null,setItem:(key,value)=>values.set(key,value)},
    setDisplayMode:(mode,persist)=>calls.push(['mode',mode,persist]),
    setThemeColor:(color,persist)=>calls.push(['accent',color,persist]),
    applyStudioAppearance(){}
  };
  vm.runInNewContext(cloudThemeSource,context);
  context._loadThemeFromCloud();
  assert.deepEqual(calls,[['accent','#123456',false],['mode','dark',false]]);
  assert.equal(values.get('studioDisplayMode'),'dark');
});

test('a new device adopts the saved cloud theme once without writing it back', () => {
  const values = new Map();
  const calls = [];
  const context = {
    S:{settings:{displayMode:'light',accentColor:'#abcdef'}},
    localStorage:{getItem:key=>values.get(key) || null,setItem:(key,value)=>values.set(key,value)},
    setDisplayMode:(mode,persist)=>calls.push(['mode',mode,persist]),
    setThemeColor:(color,persist)=>calls.push(['accent',color,persist]),
    applyStudioAppearance(){}
  };
  vm.runInNewContext(cloudThemeSource,context);
  context._loadThemeFromCloud();
  assert.deepEqual(calls,[['accent','#abcdef',false],['mode','light',false]]);
  assert.equal(values.get('studioDisplayMode'),'light');
});

test('restoring the initial theme does not save to cloud or rebuild UI', () => {
  const values = new Map([['studioDisplayMode','dark']]);
  let writes = 0;
  const style = {setProperty(){},set background(_) {},set colorScheme(_) {}};
  const classList = {toggle(){}};
  const context = {
    document:{body:{classList,style},documentElement:{classList,style},getElementById(){return null;},querySelector(){return null;}},
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    S:{settings:{}},window:{},
    lsSave(){writes++;},cloudSaveNow(){writes++;},applyStudioAppearance(){writes++;},updateUserBadge(){writes++;}
  };
  vm.runInNewContext(modeSource,context);
  context.setDisplayMode('dark',false);
  assert.equal(writes,0);
});
