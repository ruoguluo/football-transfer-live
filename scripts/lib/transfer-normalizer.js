'use strict';

const { integer, normalizeDate, relation, text } = require('./player-normalizer');

const boolOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  return Boolean(value);
};

const parseAmount = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : null;
};

function normalizeTransfer(row, references = {}) {
  const teamsById = references.teamsById || new Map();
  const typesById = references.typesById || new Map();
  const fromTeamId = integer(row?.from_team_id, { positive: true });
  const toTeamId = integer(row?.to_team_id, { positive: true });
  const typeId = integer(row?.type_id, { positive: true });
  const fromTeam = relation(row, 'fromTeam', 'fromteam') || teamsById.get(fromTeamId);
  const toTeam = relation(row, 'toTeam', 'toteam') || teamsById.get(toTeamId);
  const type = relation(row, 'type') || typesById.get(typeId);
  return {
    id: integer(row?.id, { positive: true }),
    player_id: integer(row?.player_id, { positive: true }),
    from_team_id: fromTeamId,
    to_team_id: toTeamId,
    from_team_name: text(fromTeam?.name),
    to_team_name: text(toTeam?.name),
    type_id: typeId,
    type_name: text(type?.name),
    type_code: text(type?.code),
    transfer_date: normalizeDate(row?.date),
    amount: parseAmount(row?.amount),
    amount_text: text(row?.amount),
    completed: boolOrNull(row?.completed),
    career_ended: boolOrNull(row?.career_ended),
    position_id: integer(row?.position_id, { positive: true }),
    detailed_position_id: integer(row?.detailed_position_id, { positive: true }),
    raw: row || {}
  };
}

module.exports = { boolOrNull, normalizeTransfer, parseAmount };
