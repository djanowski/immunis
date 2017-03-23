'use strict';

const Immutable = require('immutable');

let redis;

const Immunis = {
  connect(redisInstance) {
    redis = redisInstance;
  },


  save(schema, record) {
    let id;

    const idPromise = record.id ?
      Promise.resolve(record.id) :
      redis.call('incr', `${schema.name}:id`);

    return idPromise
      .then(function(_id) {
        id = _id;
        const map      = recordToMap(schema, record);
        const nonBlank = map.filter(([ , v ]) => !isBlank(v));
        const blank    = map.filter(([ , v ]) => isBlank(v)).map(([ k, ]) => k);

        return Promise.all([
          nonBlank.length && redis.call('hmset', `${schema.name}:${id}`, ... flatten(nonBlank)),
          blank.length    && redis.call('hdel',  `${schema.name}:${id}`, ... blank)
        ]);
      })
      .then(function() {
        const promises = schema.uniques.map(function(attribute) {
          const value = record.get(attribute);
          return redis.call('hsetnx', `${schema.name}:uniques:${attribute}`, value, id);
        });

        return Promise.all(promises);
      })
      .then(function() {
        const promises = schema.indices.map(function(attribute) {
          const value = record.get(attribute);
          return redis.call('sadd', `${schema.name}:indices:${attribute}:${escape(value)}`, id);
        });

        return Promise.all(promises);
      })
      .then(function() {
        return redis.call('sadd', `${schema.name}:all`, id);
      })
      .then(function() {
        return record.set('id', id);
      });
  },


  load(schema, id) {
    return redis.call('hgetall', `${schema.name}:${id}`)
      .then(function(reply) {
        if (reply.length === 0)
          return null;

        const pairs = Immutable.List(reply)
          .groupBy((_, i) => Math.floor(i / 2))
          .map(function([ attribute, value ]) {
            const conversion = schema.conversions[attribute] && schema.conversions[attribute].fromRedis;
            if (conversion)
              return [ attribute, conversion(value) ];
            else
              return [ attribute, value ];
          })
          .toList();

        const record = schema.constructor(pairs);
        return record.set('id', id);
      });
  },


  find(schema, index, value) {
    return redis.call('smembers', `${schema.name}:indices:${index}:${escape(value)}`)
      .then(function(ids) {
        return Promise.all(ids.map(id => Immunis.load(schema, id)));
      });
  },


  findAll(schema) {
    return redis.call('smembers', `${schema.name}:all`)
      .then(function(ids) {
        return Promise.all(ids.map(id => Immunis.load(schema, id)));
      });
  },


  remove(schema, id) {
    const hashKey = `${schema.name}:${id}`;

    const indicesForRemoval = Promise.all(
      schema.indices.map(function(attribute) {
        return redis.call('hget', `${schema.name}:${id}`, attribute)
          .then(function(indexedValue) {
            return `${schema.name}:indices:${attribute}:${escape(indexedValue)}`;
          });
      })
    );

    const uniquesForRemoval = Promise.all(
      schema.uniques.map(function(attribute) {
        return redis.call('hget', `${schema.name}:${id}`, attribute)
          .then(function(indexedValue) {
            return [ `${schema.name}:uniques:${attribute}`, indexedValue ];
          });
      })
    );

    return Promise.all([ indicesForRemoval, uniquesForRemoval ])
      .then(function([ indices, uniques ]) {
        return Promise.all([
          redis.call('multi'),
          redis.call('del', hashKey),
          ... indices.map(index => redis.call('srem', index, id)),
          ... uniques.map(([ index, value ]) => redis.call('hdel', index, value)),
          redis.call('srem', `${schema.name}:all`, id),
          redis.call('exec')
        ]);
      });
  },


  model(schemaAttrs) {
    const schema = Immunis.Schema(schemaAttrs);

    const model = {
      save(record) {
        return Immunis.save(schema, record);
      },

      load(id) {
        return Immunis.load(schema, id);
      },

      by(attribute, value) {
        return redis.call('hget', `${schema.name}:uniques:${attribute}`, value)
          .then(function(id) {
            return model.load(id);
          });
      },

      find(index, value) {
        return Immunis.find(schema, index, value);
      },

      findAll() {
        return Immunis.findAll(schema);
      },

      remove(id) {
        return Immunis.remove(schema, id);
      }
    };

    return model;
  },

  Schema: Immutable.Record({
    name:        null,
    constructor: null,
    conversions: {},
    uniques:     [],
    indices:     []
  })
};


function flatten(array) {
  return array.reduce((accum, other) => accum.concat(other), []);
}


function recordToMap(schema, record) {
  const entries  = Array.from(record.entries());
  const converted = entries.map(function([ key, value ]) {
    const toRedis = schema.conversions[key] && schema.conversions[key].toRedis;
    if (toRedis)
      return [ key, toRedis(value) ];
    else
      return [ key, value ];
  });
  return converted;
}


function isBlank(value) {
  if (value == null) // loose equals, includes undefined
    return true;
  else
    return false;
}


module.exports = Immunis;
