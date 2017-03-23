'use strict';

const { redis } = require('./config');
const { test }  = require('./config');

const Immunis   = require('../');
const Immutable = require('immutable');


const Person = Immutable.Record({
  id:    null,
  name:  null,
  email: null,
  year:  null,
});


test('Model - load', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person
  });

  return People.load(1)
    .then(function(person) {
      t.equal(person, null);
    });
});


test('Model - save and load', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person
  });

  const john = new Person({
    name:  'John',
    email: 'john@example.com'
  });

  return People.save(john)
    .then(function(person) {
      t.equal(person.id, 1);
      t.equal(person.name, 'John');
      t.equal(person.email, 'john@example.com');
      t.assert(person instanceof Person);
    })
    .then(function() {
      return People.load(1);
    })
    .then(function(person) {
      t.equal(person.id, 1);
      t.equal(person.name, 'John');
      t.equal(person.email, 'john@example.com');
      t.assert(person instanceof Person);
    });
});


test('Model - all', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person
  });

  const john = new Person({
    name:  'John',
    email: 'john@example.com'
  });

  const mary = new Person({
    name:  'Mary',
    email: 'mary@example.com'
  });

  return Promise.all([
    People.save(john),
    People.save(mary)
  ])
    .then(function() {
      return People.findAll()
    })
    .then(function(people) {
      t.equal(people.length, 2);
      t.equal(people[0].id, '1');
      t.equal(people[1].id, '2');
    });
});


test('Model - remove', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person,
    indices:     [ 'name' ],
    uniques:     [ 'email' ]
  });

  const john = new Person({
    name:  'John',
    email: 'john@example.com'
  });

  return People.save(john)
    .then(function(person) {
      t.equal(person.id, 1);
      return People.load(person.id)
    })
    .then(function(person) {
      t.equal(person.id, 1);
      return People.remove(1);
    })
    .then(function() {
      return People.load(1)
    })
    .then(function(person) {
      t.equal(person, null);
      return People.findAll();
    })
    .then(function(people) {
      t.equal(people.length, 0);
      return redis.call('keys', 'Person:1:*');
    })
    .then(function(keys) {
      t.equal(keys.length, 0);
    })
    .then(function() {
      return redis.call('hget', 'Person:uniques:email', 'john@example.com');
    })
    .then(function(unique) {
      t.equal(unique, null);
    })
    .then(function() {
      return redis.call('sismember', 'Person:indices:name', 1);
    })
    .then(function(isMember) {
      t.equal(isMember, 0);
    });
});


test('Model - uniques', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person,
    uniques:     [ 'email' ]
  });

  const john = new Person({
    name:  'John',
    email: 'john@example.com'
  });

  return People.save(john)
    .then(function() {
      return People.by('email', 'john@example.com');
    })
    .then(function(person) {
      t.equal(person.name, 'John');
      t.equal(person.email, 'john@example.com');
      t.assert(person instanceof Person);
    });
});


test('Model - indices', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person,
    indices:     [ 'year' ]
  });

  const john = new Person({ id: '1', year: '2010' });
  const mary = new Person({ id: '2', year: '2010' });
  const fred = new Person({ id: '3', year: '2011' });

  const saves = Promise.all([
    People.save(john),
    People.save(mary),
    People.save(fred),
  ]);

  return saves
    .then(function() {
      return People.find('year', 2010);
    })
    .then(function(people) {
      t.deepEqual(people, [ john, mary ]);
    })
    .then(function() {
      return People.find('year', 2011);
    })
    .then(function(people) {
      t.deepEqual(people, [ fred ]);
    });
});


test('Model - conversions', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person,
    conversions: {
      year: {
        fromRedis: string => 2000 + parseInt(string),
        toRedis:   value  => value - 2000
      }
    }
  });

  const john = new Person({ id: '1', year: 2010 });

  return People.save(john)
    .then(function() {
      return redis.call('hget', 'Person:1', 'year');
    })
    .then(function(valueInRedis) {
      t.equal(valueInRedis, '10');
    })
    .then(function() {
      return People.load(1);
    })
    .then(function(person) {
      t.strictEqual(person.year, 2010);
    });
});


test('Model - update an attribute to null', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person
  });

  const john = new Person({
    name:  'John',
    email: 'john@example.com'
  });

  return People.save(john)
    .then(function(person) {
      return People.load(person.id);
    })
    .then(function(person) {
      t.equal(person.email, 'john@example.com');
      return People.save(person.set('email', null));
    })
    .then(function(person) {
      return People.load(person.id);
    })
    .then(function(person) {
      t.equal(person.email, null);
    });
});


test('Model - update an attribute to 0', function(t) {
  const People = Immunis.model({
    name:        'Person',
    constructor: Person
  });

  const john = new Person({
    name: 'John',
    year: 1
  });

  return People.save(john)
    .then(function(person) {
      return People.load(person.id);
    })
    .then(function(person) {
      t.equal(person.year, '1');
      return People.save(person.set('year', 0));
    })
    .then(function(person) {
      return People.load(person.id);
    })
    .then(function(person) {
      t.equal(person.year, '0');
    });
});
