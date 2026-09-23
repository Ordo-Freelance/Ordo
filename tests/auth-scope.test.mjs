import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionCookieName, setCookie, clearCookie, currentUser } from '../api/index.js';

const request = scope => ({headers:{cookie:'ordo_session=user-token; ordo_admin_session=admin-token', ...(scope ? {'x-ordo-auth-scope':scope} : {})}});

test('admin and user requests retain independent persistent cookies', async () => {
  assert.equal(sessionCookieName(request()), 'ordo_session');
  assert.equal(sessionCookieName(request('admin')), 'ordo_admin_session');
  const seen = [];
  const store = {async userBySession(token){seen.push(token);return {id:token,status:'active'};}};
  assert.equal((await currentUser(request(),store)).user.id, 'user-token');
  assert.equal((await currentUser(request('admin'),store)).user.id, 'admin-token');
  assert.deepEqual(seen, ['user-token','admin-token']);
});

test('login and logout change only the cookie for their own scope', () => {
  for(const scope of [undefined,'admin']) {
    const req = request(scope);
    const res = {setHeader(name,value){assert.equal(name,'Set-Cookie');this.cookie=value;}};
    setCookie(res,'new-token',req);
    assert.match(res.cookie,new RegExp(`^${sessionCookieName(req)}=new-token;`));
    clearCookie(res,req);
    assert.match(res.cookie,new RegExp(`^${sessionCookieName(req)}=;`));
  }
});
