'use strict';

const { integer, text } = require('./player-normalizer');

function isSafeHttpUrl(value) {
  const candidate = text(value);
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeSocial(row) {
  const playerId = integer(row?.player_id, { positive: true });
  const platform = text(row?.platform);
  const url = text(row?.url);
  if (!playerId || !platform || !isSafeHttpUrl(url)) return null;
  const sourceUrl = text(row?.source_url);
  return {
    player_id: playerId,
    platform,
    handle: text(row?.handle),
    url,
    source_name: text(row?.source_name),
    source_url: isSafeHttpUrl(sourceUrl) ? sourceUrl : null,
    verified: row?.verified === true,
    raw: row || {}
  };
}

function socialKey(row) {
  return `${row.player_id}|${row.platform}|${row.url}`;
}

module.exports = { isSafeHttpUrl, normalizeSocial, socialKey };
