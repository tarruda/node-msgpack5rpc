/* jshint loopfunc: true */
import * as cp from "child_process"
import * as which from "which"
import Session = require('./index')
import { expect } from "chai"

try {
  which.sync('nvim');
} catch (e) {
  console.error('A Neovim installation is required to run the tests',
                '(see https://github.com/neovim/neovim/wiki/Installing)');
  process.exit(1);
}


class Buffer  { constructor(public data) { }  }
class Window  { constructor(public data) { }  }
class Tabpage { constructor(public data) { }  }

describe('Session', function() {

  let nvim, session, requests, notifications;

  before(async function () {
    nvim = cp.spawn('nvim', ['-u', 'NONE', '-N', '--embed'], {
      cwd: __dirname
    })
    session = new Session()
    session.attach(nvim.stdin, nvim.stdout)
    const [num, metadata] = await session.request('vim_get_api_info', [])
    var types = [];

    for (const Type of [Buffer, Window, Tabpage]) {
      types.push({
        constructor: Type,
        code: metadata.types[Type.name].id,
        decode: function(data) { return new Type(data); },
        encode: function(obj) { return obj.data; }
      })
    }

    session.detach()
    session = new Session(types)
    session.attach(nvim.stdin, nvim.stdout)
    session.on('request', function(method, args, resp) {
      requests.push({method: method, args: args})
      resp.send('received ' + method + '(' + args.toString() + ')')
    })
    session.on('notification', function(method, args) {
      notifications.push({method: method, args: args})
    })
  })

  beforeEach(function() {
    requests = []
    notifications = []
  })

  it('can send requests and receive response', async function () {
    const res = await session.request('vim_eval', ['{"k1": "v1", "k2": 2}'])
    res.k1 = res.k1.toString();
    expect(res).to.deep.equal({k1: 'v1', k2: 2})
  })

  it('can receive requests and send responses', async function() {
    const res = await session.request('vim_eval', ['rpcrequest(1, "request", 1, 2, 3)'])
    expect(res.toString()).to.equal('received request(1,2,3)')
    expect(requests).to.deep.equal([{method: 'request', args: [1, 2, 3]}])
    expect(notifications).to.have.lengthOf(0)
  })

  it('can receive notifications', async function() {
    const res = await session.request('vim_eval', ['rpcnotify(1, "notify", 1, 2, 3)'])
    expect(res).to.equal(1)
    expect(requests).to.have.lengthOf(0)
    return new Promise((acc, rej) => {
      setImmediate(function() {
        expect(notifications).to.deep.equal([{method: 'notify', args: [1, 2, 3]}])
        acc()
      })
    })
  })

  it('can deal with custom types', async function() {
    const res = await session.request('vim_command', ['vsp'])
    const windows = await session.request('vim_get_windows', [])
    expect(windows).to.have.lengthOf(2)
    expect(windows[0]).to.be.an.instanceof(Window)
    expect(windows[1]).to.be.an.instanceof(Window)
    await session.request('vim_set_current_window', [windows[1]])
    const win = await session.request('vim_get_current_window', [])
    expect(win.data.toString()).to.equal(windows[1].data.toString())
  })

})
