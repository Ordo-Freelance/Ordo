import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const admin = fs.readFileSync(new URL('../HTML/admin.html', import.meta.url), 'utf8');
const accordionSource = admin.slice(admin.indexOf('function setPlanPermissionOpen(body, open){'), admin.indexOf('function updateAccBadge(key) {'));

function element(){
  const classes = new Set();
  return {
    classList:{contains:name=>classes.has(name),toggle:(name,on)=>on ? classes.add(name) : classes.delete(name)},
    style:{display:'',transform:''},
    attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    querySelector(){return this.arrow||null;}
  };
}

test('plan permission accordion closes the same section and any previously open section', () => {
  const tasks = element();
  const team = element();
  for(const body of [tasks,team]){
    body.previousElementSibling = element();
    body.previousElementSibling.arrow = element();
  }
  const lookup = {'acc-body-tasks':tasks,'acc-body-team':team};
  const context = {document:{getElementById:id=>lookup[id],querySelectorAll:()=>[tasks,team].filter(body=>body.classList.contains('open'))}};
  vm.runInNewContext(accordionSource,context);

  context.toggleAcc('team');
  assert.equal(team.style.display,'flex');
  assert.equal(team.previousElementSibling.attributes['aria-expanded'],'true');
  context.toggleAcc('team');
  assert.equal(team.style.display,'none');
  assert.equal(team.previousElementSibling.attributes['aria-expanded'],'false');
  context.toggleAcc('team');
  context.toggleAcc('tasks');
  assert.equal(team.style.display,'none');
  assert.equal(tasks.style.display,'flex');
});

test('plan permission groups follow the live user navigation order', () => {
  const source = admin.slice(admin.indexOf('function organizePlanPermissionSections(){'), admin.indexOf('function setPlanPermissionOpen(body, open){'));
  const names = ['المشاريع','إدارة العمل والعملاء','المالية','الفريق','النظام والمساحة','خيارات متقدمة'];
  const positions = names.map(name=>source.indexOf(`['${name}'`));
  assert.ok(positions.every(position=>position>=0));
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b));
  assert.match(source,/\['feat-schedule','feat-schedule-day','feat-schedule-export','feat-meetings'\]/);
  assert.match(source,/\['feat-timetracker'\]/);
});
