'use strict';

const text = value => {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const integer = (value, { positive = false } = {}) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || (positive && parsed <= 0) || parsed < 0) return null;
  return parsed;
};

const relation = (source, ...names) => {
  if (!source || typeof source !== 'object') return null;
  for (const name of names) {
    if (source[name] !== undefined && source[name] !== null) return source[name];
  }
  return null;
};

const normalizeName = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normalizeDate = value => {
  const candidate = text(value);
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
};

function resolveLeague(rows, definition) {
  const names = new Set(definition.names.map(normalizeName));
  const countries = new Set(definition.countries.map(normalizeName));
  const candidates = (Array.isArray(rows) ? rows : []).filter(row => {
    if (!row || row.active === false) return false;
    if (text(row.sub_type) !== 'domestic') return false;
    if (!names.has(normalizeName(row.name))) return false;
    const countryName = text(relation(row, 'country')?.name);
    return !countryName || countries.has(normalizeName(countryName));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function normalizeLeague(league, code) {
  const season = relation(league, 'currentSeason', 'currentseason', 'current_season');
  const country = relation(league, 'country');
  return {
    id: integer(league?.id, { positive: true }),
    code,
    name: text(league?.name),
    country_id: integer(league?.country_id, { positive: true }),
    country_name: text(country?.name),
    current_season_id: integer(season?.id, { positive: true }),
    active: league?.active !== false,
    raw: league || {}
  };
}

function normalizeSeason(season, leagueId) {
  return {
    id: integer(season?.id, { positive: true }),
    league_id: integer(leagueId, { positive: true }),
    name: text(season?.name),
    starting_at: normalizeDate(season?.starting_at),
    ending_at: normalizeDate(season?.ending_at),
    is_current: season?.is_current === true,
    raw: season || {}
  };
}

function normalizeTeam(team) {
  return {
    id: integer(team?.id, { positive: true }),
    name: text(team?.name),
    short_code: text(team?.short_code),
    country_id: integer(team?.country_id, { positive: true }),
    image_path: text(team?.image_path),
    founded: integer(team?.founded, { positive: true }),
    placeholder: team?.placeholder === true,
    raw: team || {}
  };
}

function normalizePlayer(player) {
  const nationality = relation(player, 'nationality');
  const position = relation(player, 'position');
  const detailedPosition = relation(player, 'detailedPosition', 'detailedposition');
  const firstname = text(player?.firstname);
  const lastname = text(player?.lastname);
  const assembledName = [firstname, lastname].filter(Boolean).join(' ') || null;
  return {
    id: integer(player?.id, { positive: true }),
    common_name: text(player?.common_name),
    firstname,
    lastname,
    name: text(player?.name),
    display_name: text(player?.display_name) || text(player?.common_name) || text(player?.name) || assembledName,
    country_id: integer(player?.country_id, { positive: true }),
    nationality_id: integer(player?.nationality_id, { positive: true }),
    nationality_name: text(nationality?.name),
    city_id: integer(player?.city_id, { positive: true }),
    position_id: integer(player?.position_id, { positive: true }),
    detailed_position_id: integer(player?.detailed_position_id, { positive: true }),
    position_name: text(position?.name),
    detailed_position_name: text(detailedPosition?.name),
    height_cm: integer(player?.height, { positive: true }),
    weight_kg: integer(player?.weight, { positive: true }),
    date_of_birth: normalizeDate(player?.date_of_birth),
    gender: text(player?.gender),
    image_path: text(player?.image_path),
    raw: player || {}
  };
}

function normalizeMembership(squad) {
  const position = relation(squad, 'position');
  return {
    id: integer(squad?.id, { positive: true }),
    season_id: integer(squad?.season_id, { positive: true }),
    team_id: integer(squad?.team_id, { positive: true }),
    player_id: integer(squad?.player_id, { positive: true }),
    position_id: integer(squad?.position_id, { positive: true }),
    jersey_number: integer(squad?.jersey_number),
    position_name: text(position?.name),
    raw: squad || {}
  };
}

module.exports = {
  integer,
  normalizeDate,
  normalizeLeague,
  normalizeMembership,
  normalizeName,
  normalizePlayer,
  normalizeSeason,
  normalizeTeam,
  relation,
  resolveLeague,
  text
};
