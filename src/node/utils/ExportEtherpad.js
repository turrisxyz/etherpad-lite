'use strict';
/**
 * 2014 John McLear (Etherpad Foundation / McLear Ltd)
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

const assert = require('assert').strict;
const authorManager = require('../db/AuthorManager');
const hooks = require('../../static/js/pluginfw/hooks');
const padManager = require('../db/PadManager');

exports.getPadRaw = async (padId, readOnlyId) => {
  const pad = await padManager.getPad(padId);
  const keyPrefix = `pad:${readOnlyId || padId}`;

  const data = {};
  const dbBackup = pad.db;
  const tmpDb = pad.db = new Map();
  try {
    await pad.saveToDatabase();
  } finally {
    pad.db = dbBackup;
  }
  assert.equal(tmpDb.size, 1);
  data[keyPrefix] = [...tmpDb.values()][0];
  for (const authorId of pad.getAllAuthors()) {
    const authorEntry = await authorManager.getAuthor(authorId);
    if (!authorEntry) continue;
    data[`globalAuthor:${authorId}`] = authorEntry;
    if (!authorEntry.padIDs) continue;
    authorEntry.padIDs = readOnlyId || padId;
  }
  for (let i = 0; i <= pad.head; ++i) {
    data[`${keyPrefix}:revs:${i}`] = await pad.getRevision(i);
  }
  for (let i = 0; i <= pad.chatHead; ++i) {
    data[`${keyPrefix}:chat:${i}`] = await pad.getChatMessage(i);
  }
  const prefixes = await hooks.aCallAll('exportEtherpadAdditionalContent');
  await Promise.all(prefixes.map(async (prefix) => {
    const rkp = `${prefix}:${padId}`;
    assert(!rkp.includes('*'));
    const wkp = `${prefix}:${readOnlyId || padId}`;
    data[wkp] = await pad.db.get(rkp);
    for (const k of await pad.db.findKeys(`${rkp}:*`, null)) {
      const pfx = `${rkp}:`;
      assert(k.startsWith(pfx));
      data[`${wkp}:${k.slice(pfx.length)}`] = await pad.db.get(k);
    }
  }));

  return data;
};
