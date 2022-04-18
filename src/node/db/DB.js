'use strict';

/**
 * The DB Module provides a database initialized with the settings
 * provided by the settings module
 */

/*
 * 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const ueberDB = require('ueberdb2');
const settings = require('../utils/Settings');
const log4js = require('log4js');
const stats = require('../stats');
const util = require('util');

// set database settings
const db =
    new ueberDB.Database(settings.dbType, settings.dbSettings, null, log4js.getLogger('ueberDB'));

/**
 * The UeberDB Object that provides the database functions
 */
exports.db = null;

/**
 * Initializes the database with the settings provided by the settings module
 * @param {Function} callback
 */
exports.init = async () => await new Promise((resolve, reject) => {
  db.init((err) => {
    if (err) {
      // there was an error while initializing the database, output it and stop
      console.error('ERROR: Problem while initalizing the database');
      console.error(err.stack ? err.stack : err);
      process.exit(1);
    }
    if (db.metrics != null) {
      for (const [metric, value] of Object.entries(db.metrics)) {
        if (typeof value !== 'number') continue;
        stats.gauge(`ueberdb_${metric}`, () => db.metrics[metric]);
      }
    }
    for (const [fn, f] of Object.entries(exports.promisifyUeberDb(db))) exports[fn] = f;
    // exposed for those callers that need the underlying raw API
    exports.db = db;
    resolve();
  });
});

exports.promisifyUeberDb = (udb) => {
  const fns = ['get', 'set', 'findKeys', 'getSub', 'setSub', 'remove'];
  const db = Object.fromEntries(fns.map((fn) => [fn, util.promisify(udb[fn].bind(udb))]));
  // Make sure `get` and `getSub` always return `null` instead of `undefined`.
  for (const fn of ['get', 'getSub']) {
    const f = db[fn];
    db[fn] = async (...args) => {
      const result = await f(...args);
      return result === undefined ? null : result;
    };
    // Mimic util.promisify().
    Object.setPrototypeOf(db[fn], Object.getPrototypeOf(f));
    Object.defineProperties(db[fn], Object.getOwnPropertyDescriptors(f));
  }
  return db;
};

exports.shutdown = async (hookName, context) => {
  await util.promisify(db.close.bind(db))();
  console.log('Database closed');
};
