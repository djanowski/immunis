'use strict';


process.env.NODE_ENV = 'test';


const Bluebird = require('bluebird');
global.Promise = Bluebird;

Bluebird.config({ longStackTraces: true });


const _test   = require('tape-promise').default(require('tape'));
const YoRedis = require('yoredis');
const Immunis = require('../');


const redis   = new YoRedis({ url: 'redis://127.0.0.1:6379' });

Immunis.connect(redis);


_test.onFinish(function() {
  return redis.call('quit').catch(function() { });
});


function test(name, fn) {
  _test('setup', function() {
    return redis.call('flushdb');
  });
  _test(name, fn);
}


module.exports = { test, redis };
