'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');

const { ROOT, loadEnvFile } = require('./lib/env');
const { runPsql } = require('./lib/psql');

loadEnvFile();

const SQL = `
WITH demo AS (
  SELECT * FROM public.current_demo_players
), demo_player_ids AS (
  SELECT DISTINCT player_id FROM demo
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'league', COALESCE((
    SELECT jsonb_build_object(
      'code', l.code, 'name', l.name, 'country_name', l.country_name,
      'season_id', l.current_season_id, 'is_demo', l.is_demo
    )
    FROM public.leagues l WHERE l.is_demo ORDER BY l.code LIMIT 1
  ), 'null'::jsonb),
  'season', COALESCE((
    SELECT jsonb_build_object(
      'id', s.id, 'name', s.name, 'starting_at', s.starting_at,
      'ending_at', s.ending_at, 'is_current', s.is_current
    )
    FROM public.seasons s
    WHERE s.id = (
      SELECT current_season_id FROM public.leagues
      WHERE is_demo ORDER BY code LIMIT 1
    )
  ), 'null'::jsonb),
  'summary', jsonb_build_object(
    'teams', (SELECT count(DISTINCT team_id) FROM demo),
    'players', (SELECT count(*) FROM demo_player_ids),
    'memberships', (SELECT count(*) FROM demo),
    'transfers', (
      SELECT count(*) FROM public.player_transfers t
      WHERE t.player_id IN (SELECT player_id FROM demo_player_ids)
    ),
    'players_with_transfers', (
      SELECT count(DISTINCT t.player_id) FROM public.player_transfers t
      WHERE t.player_id IN (SELECT player_id FROM demo_player_ids)
    ),
    'social_links', (
      SELECT count(*) FROM public.player_socials s
      WHERE s.player_id IN (SELECT player_id FROM demo_player_ids)
    ),
    'players_with_socials', (
      SELECT count(DISTINCT s.player_id) FROM public.player_socials s
      WHERE s.player_id IN (SELECT player_id FROM demo_player_ids)
    )
  ),
  'memberships', COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.team_name, x.display_name, x.player_id)
    FROM demo x
  ), '[]'::jsonb),
  'players', COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'player_id', p.id,
        'display_name', p.display_name,
        'common_name', p.common_name,
        'name', p.name,
        'date_of_birth', p.date_of_birth,
        'nationality_name', p.nationality_name,
        'position_name', p.position_name,
        'detailed_position_name', p.detailed_position_name,
        'height_cm', p.height_cm,
        'weight_kg', p.weight_kg,
        'image_path', p.image_path,
        'teams', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'team_id', m.team_id,
            'team_name', m.team_name,
            'jersey_number', m.jersey_number,
            'source_squad_id', m.source_squad_id
          ) ORDER BY m.team_name, m.jersey_number NULLS LAST)
          FROM demo m WHERE m.player_id = p.id
        ), '[]'::jsonb),
        'transfers', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', t.id,
            'transfer_date', t.transfer_date,
            'from_team_id', t.from_team_id,
            'from_team_name', t.from_team_name,
            'to_team_id', t.to_team_id,
            'to_team_name', t.to_team_name,
            'type_name', t.type_name,
            'type_code', t.type_code,
            'amount', t.amount,
            'amount_text', t.amount_text,
            'completed', t.completed,
            'career_ended', t.career_ended
          ) ORDER BY t.transfer_date DESC NULLS LAST, t.id DESC)
          FROM public.player_transfers t WHERE t.player_id = p.id
        ), '[]'::jsonb)
      ) ORDER BY p.display_name, p.id
    )
    FROM public.players p
    WHERE p.id IN (SELECT player_id FROM demo_player_ids)
  ), '[]'::jsonb),
  'socials', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'player_id', s.player_id,
      'platform', s.platform,
      'handle', s.handle,
      'url', s.url,
      'source_name', s.source_name,
      'verified', s.verified
    ) ORDER BY s.player_id, s.platform, s.url)
    FROM public.player_socials s
    WHERE s.player_id IN (SELECT player_id FROM demo_player_ids)
  ), '[]'::jsonb),
  'latest_sync', COALESCE((
    SELECT to_jsonb(r) FROM (
      SELECT id, mode, status, requested_leagues, stats, error, started_at, finished_at
      FROM public.sync_runs ORDER BY started_at DESC LIMIT 1
    ) r
  ), 'null'::jsonb)
)::text;
`;

const SHARED_STYLES = `
  :root { color-scheme: light; --bg: #f5f7fa; --surface: #ffffff; --text: #172033; --muted: #667085; --line: #e4e8ef; --accent: #2458a6; --accent-soft: #eaf1fb; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.55; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .shell { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
  header { margin-bottom: 24px; }
  .eyebrow { margin: 0 0 8px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  h1 { margin: 0 0 10px; font-size: clamp(26px, 4vw, 38px); line-height: 1.2; }
  .lede { max-width: 820px; margin: 0; color: var(--muted); }
  .notice { margin: 18px 0; padding: 12px 16px; border: 1px solid #f0c97a; border-radius: 10px; background: #fff8e8; color: #6b4b12; font-size: 14px; }
  .stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
  .stat { padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .stat .label { display: block; color: var(--muted); font-size: 12px; }
  .stat .value { display: block; margin-top: 4px; font-size: 24px; font-weight: 700; }
  .meta { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 0 0 20px; color: var(--muted); font-size: 13px; }
  .controls { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  input, select { min-height: 40px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
  input { flex: 1 1 320px; }
  select { min-width: 220px; }
  .count { color: var(--muted); font-size: 13px; margin: 0 0 10px; }
  .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th { position: sticky; top: 0; background: var(--accent-soft); color: #213d68; font-weight: 650; z-index: 1; }
  tbody tr:hover { background: #f8fbff; }
  tbody tr:last-child td { border-bottom: 0; }
  .empty { padding: 28px; text-align: center; color: var(--muted); }
  .panel { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 20px; margin-bottom: 20px; }
  .profile { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .field .label { display: block; color: var(--muted); font-size: 12px; }
  .field .value { display: block; margin-top: 3px; font-weight: 600; overflow-wrap: anywhere; }
  h2 { margin: 0 0 12px; font-size: 20px; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  .muted { color: var(--muted); font-size: 13px; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: #213d68; font-size: 12px; }
  .player-head { display: flex; align-items: center; gap: 20px; }
  .player-head-text { min-width: 0; }
  .avatar-wrap { position: relative; display: inline-flex; flex: 0 0 auto; width: 96px; height: 96px; border: 1px solid var(--line); border-radius: 50%; overflow: hidden; background: var(--accent-soft); color: #213d68; }
  .avatar-wrap.small { width: 32px; height: 32px; font-size: 11px; }
  .avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
  .avatar-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 700; letter-spacing: .03em; }
  .name-cell { display: flex; align-items: center; gap: 10px; }
  .social-links { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .social-link { display: inline-flex; align-items: center; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--accent-soft); color: #213d68; font-size: 12px; }
  .social-link:hover { text-decoration: none; background: #dce9fa; }
  .social-empty { color: var(--muted); font-size: 12px; }
  .social-more { color: var(--muted); font-size: 12px; }
  footer { margin-top: 20px; color: var(--muted); font-size: 12px; }
  @media (max-width: 900px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 760px) { .profile { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const AVATAR_HELPERS = `
      function avatarInitials(name) {
        var parts = String(name || '').trim().split(/\\s+/).filter(Boolean);
        if (!parts.length) return '#';
        return parts.slice(0, 2).map(function (part) {
          return part.charAt(0).toUpperCase();
        }).join('');
      }
      function isSafeAvatarUrl(value) {
        if (!value || typeof value !== 'string') return false;
        try {
          var url = new URL(value, window.location.href);
          return url.protocol === 'https:'
            && url.hostname === 'cdn.sportmonks.com'
            && url.pathname.toLowerCase().indexOf('/placeholder.png') === -1;
        } catch (error) {
          return false;
        }
      }
      function createAvatar(url, name, small) {
        var wrap = document.createElement('span');
        wrap.className = small ? 'avatar-wrap small' : 'avatar-wrap';
        var fallback = document.createElement('span');
        fallback.className = 'avatar-fallback';
        fallback.textContent = avatarInitials(name);
        if (isSafeAvatarUrl(url)) {
          var image = document.createElement('img');
          image.className = 'avatar';
          image.alt = String(name || '球员') + ' 头像';
          image.loading = 'lazy';
          image.decoding = 'async';
          image.referrerPolicy = 'no-referrer';
          image.src = url;
          image.addEventListener('error', function () {
            image.remove();
            fallback.hidden = false;
          });
          wrap.appendChild(image);
          fallback.hidden = true;
        }
        wrap.appendChild(fallback);
        return wrap;
      }
`;

const SOCIAL_HELPERS = `
      function isSafeSocialUrl(value) {
        if (!value || typeof value !== 'string') return false;
        try {
          var url = new URL(value, window.location.href);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (error) {
          return false;
        }
      }
      function socialTitle(link) {
        var parts = [link.platform || '公开链接'];
        if (link.handle) parts.push('账号 ' + link.handle);
        if (link.source_name) parts.push('来源 ' + link.source_name);
        if (link.verified === true) parts.push('已核验');
        return parts.join(' · ');
      }
      function socialDisplay(link) {
        return link.platform || '公开链接';
      }
      function createSocialLinks(rows, compact) {
        var container = document.createElement('span');
        container.className = 'social-links';
        var links = Array.isArray(rows) ? rows.filter(function (row) {
          return row && isSafeSocialUrl(row.url);
        }) : [];
        if (!links.length) {
          var empty = document.createElement('span');
          empty.className = 'social-empty';
          empty.textContent = '暂未收录';
          container.appendChild(empty);
          return container;
        }
        var visible = compact ? links.slice(0, 3) : links;
        visible.forEach(function (link) {
          var anchor = document.createElement('a');
          anchor.className = 'social-link';
          anchor.href = link.url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.textContent = socialDisplay(link);
          anchor.title = socialTitle(link);
          container.appendChild(anchor);
        });
        if (compact && links.length > visible.length) {
          var more = document.createElement('span');
          more.className = 'social-more';
          more.textContent = '+' + (links.length - visible.length);
          more.title = socialTitle(links[visible.length]) + ' 等链接';
          container.appendChild(more);
        }
        return container;
      }
`;

const UI_HELPERS = AVATAR_HELPERS + SOCIAL_HELPERS;

const HTML_INDEX = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>Scottish Premiership 球员数据 Demo</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <main class="shell">
    <header>
      <p class="eyebrow">Demo dataset</p>
      <h1>Scottish Premiership 球员基础信息</h1>
      <p class="lede">点击球员姓名进入个人页面，查看基础资料与已确认转会历史。数据源为 Sportmonks Football API v3；本页是 Supabase 的静态快照。</p>
    </header>

    <div class="notice">演示数据不是欧洲五大联赛目标数据。数据库通过 <code>leagues.is_demo</code> 标识，不会进入 <code>current_top5_players</code> 视图。转会历史仅包含已确认转会，不包含传闻。</div>

    <section class="stats" aria-label="数据摘要">
      <div class="stat"><span class="label">球队</span><span class="value" id="stat-teams">—</span></div>
      <div class="stat"><span class="label">去重球员</span><span class="value" id="stat-players">—</span></div>
      <div class="stat"><span class="label">当前阵容关系</span><span class="value" id="stat-memberships">—</span></div>
      <div class="stat"><span class="label">转会记录</span><span class="value" id="stat-transfers">—</span></div>
      <div class="stat"><span class="label">赛季</span><span class="value" id="stat-season">—</span></div>
    </section>

    <div class="meta">
      <span>联赛：<strong id="meta-league">—</strong></span>
      <span>赛季：<span id="meta-season-name">—</span></span>
      <span>赛季 ID：<span id="meta-season-id">—</span></span>
      <span>赛季日期：<span id="meta-season-dates">—</span></span>
      <span>有转会历史球员：<span id="meta-players-with-transfers">—</span></span>
      <span>公开社媒：<span id="meta-social-links">0</span> 条 / <span id="meta-players-with-socials">0</span> 人</span>
      <span>同步状态：<span id="meta-sync">—</span></span>
      <span>生成时间：<span id="meta-generated">—</span></span>
    </div>

    <section class="controls" aria-label="筛选">
      <input id="search" type="search" placeholder="搜索球员、球队、国籍或位置" autocomplete="off">
      <select id="team-filter"><option value="">全部球队</option></select>
    </section>
    <p class="count" id="result-count"></p>

    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>球员</th><th>球队</th><th>位置</th><th>详细位置</th><th>国籍</th><th>出生日期</th><th>身高</th><th>体重</th><th>号码</th><th>公开社媒</th>
        </tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>

    <footer>静态快照由 <code>npm run demo:report</code> 生成；转会历史由 <code>npm run sync:demo:transfers</code> 采集。</footer>
  </main>

  <script src="demo-data.js?v=__DATA_VERSION__"></script>
  <script>
    (function () {
${UI_HELPERS}
      var data = window.DEMO_DATA || {};
      var memberships = Array.isArray(data.memberships) ? data.memberships : [];
      var socials = Array.isArray(data.socials) ? data.socials : [];
      var socialsByPlayer = new Map();
      socials.forEach(function (link) {
        if (!link || !link.player_id) return;
        var key = String(link.player_id);
        if (!socialsByPlayer.has(key)) socialsByPlayer.set(key, []);
        socialsByPlayer.get(key).push(link);
      });
      var summary = data.summary || {};
      var league = data.league || {};
      var season = data.season || {};
      var sync = data.latest_sync || {};

      function setText(id, value) {
        document.getElementById(id).textContent = value === null || value === undefined || value === '' ? '—' : String(value);
      }
      function fmt(value) {
        if (value === null || value === undefined || value === '') return '—';
        return String(value);
      }
      setText('stat-teams', summary.teams);
      setText('stat-players', summary.players);
      setText('stat-memberships', summary.memberships);
      setText('stat-transfers', summary.transfers);
      setText('stat-season', season.name || season.id);
      setText('meta-league', league.name);
      setText('meta-season-name', season.name);
      setText('meta-season-id', season.id);
      setText('meta-season-dates', season.starting_at && season.ending_at
        ? season.starting_at + ' – ' + season.ending_at
        : null);
      setText('meta-players-with-transfers', summary.players_with_transfers);
      setText('meta-social-links', summary.social_links);
      setText('meta-players-with-socials', summary.players_with_socials);
      setText('meta-sync', sync.status ? sync.mode + ' / ' + sync.status : '');
      setText('meta-generated', data.generated_at);

      var teamFilter = document.getElementById('team-filter');
      var teams = [];
      memberships.forEach(function (row) {
        if (row.team_name && teams.indexOf(row.team_name) === -1) teams.push(row.team_name);
      });
      teams.sort(function (a, b) { return a.localeCompare(b, 'en'); });
      teams.forEach(function (team) {
        var option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamFilter.appendChild(option);
      });

      var search = document.getElementById('search');
      var rows = document.getElementById('rows');
      var resultCount = document.getElementById('result-count');
      var columns = [
        'team_name', 'position_name', 'detailed_position_name',
        'nationality_name', 'date_of_birth', 'height_cm', 'weight_kg', 'jersey_number'
      ];

      function render() {
        var query = search.value.trim().toLowerCase();
        var selectedTeam = teamFilter.value;
        var filtered = memberships.filter(function (row) {
          if (selectedTeam && row.team_name !== selectedTeam) return false;
          if (!query) return true;
          return [row.display_name, row.common_name, row.name, row.team_name,
            row.nationality_name, row.position_name, row.detailed_position_name]
            .some(function (value) { return String(value || '').toLowerCase().indexOf(query) !== -1; });
        });
        rows.replaceChildren();
        if (!filtered.length) {
          var emptyRow = document.createElement('tr');
          var emptyCell = document.createElement('td');
          emptyCell.colSpan = columns.length + 2;
          emptyCell.className = 'empty';
          emptyCell.textContent = '没有匹配的球员。';
          emptyRow.appendChild(emptyCell);
          rows.appendChild(emptyRow);
        } else {
          filtered.forEach(function (row) {
            var tr = document.createElement('tr');
            var nameCell = document.createElement('td');
            nameCell.className = 'name-cell';
            var link = document.createElement('a');
            link.href = 'player-detail.html?playerId=' + encodeURIComponent(row.player_id);
            link.textContent = fmt(row.display_name || row.common_name || row.name || ('球员 #' + row.player_id));
            nameCell.appendChild(createAvatar(row.image_path, link.textContent, true));
            nameCell.appendChild(link);
            tr.appendChild(nameCell);
            columns.forEach(function (key) {
              var td = document.createElement('td');
              td.textContent = fmt(row[key]);
              tr.appendChild(td);
            });
            var socialCell = document.createElement('td');
            socialCell.appendChild(createSocialLinks(socialsByPlayer.get(String(row.player_id)), true));
            tr.appendChild(socialCell);
            rows.appendChild(tr);
          });
        }
        resultCount.textContent = '显示 ' + filtered.length + ' / ' + memberships.length + ' 条阵容记录';
      }

      search.addEventListener('input', render);
      teamFilter.addEventListener('change', render);
      render();
    })();
  </script>
</body>
</html>
`;

const HTML_DETAIL = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <title>球员个人资料与转会历史</title>
  <style>${SHARED_STYLES}</style>
</head>
<body>
  <main class="shell">
    <a class="back" href="scottish-premiership-demo.html">← 返回球员列表</a>
    <header class="player-head">
      <div id="avatar-wrap"></div>
      <div class="player-head-text">
        <p class="eyebrow">Player profile</p>
        <h1 id="player-name">球员资料</h1>
        <p class="lede" id="player-subtitle">基础资料与已确认转会历史。</p>
      </div>
    </header>

    <div class="notice">转会历史仅包含 Sportmonks 已确认转会记录，不包含传闻。金额按上游原值展示；未披露金额保留为空值，不写为 0。</div>

    <section class="panel" aria-label="基础资料">
      <h2>基础资料</h2>
      <div class="profile" id="profile"></div>
    </section>

    <section class="panel" aria-label="当前球队">
      <h2>当前球队</h2>
      <div id="teams"></div>
    </section>

    <section class="panel" aria-label="公开社媒">
      <div class="section-head"><h2>公开社媒</h2><span class="muted" id="social-count"></span></div>
      <div id="social-links"></div>
    </section>

    <section class="panel" aria-label="转会历史">
      <div class="section-head"><h2>转会历史</h2><span class="muted" id="transfer-count"></span></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>日期</th><th>类型</th><th>从</th><th>至</th><th>金额（上游原值）</th><th>状态</th></tr></thead>
          <tbody id="transfer-rows"></tbody>
        </table>
      </div>
    </section>

    <footer>静态快照由 <code>npm run demo:report</code> 生成；数据生成时间：<span id="generated">—</span>。</footer>
  </main>

  <script src="demo-data.js?v=__DATA_VERSION__"></script>
  <script>
    (function () {
${UI_HELPERS}
      var data = window.DEMO_DATA || {};
      var players = Array.isArray(data.players) ? data.players : [];
      var season = data.season || {};
      var socials = Array.isArray(data.socials) ? data.socials : [];
      var socialsByPlayer = new Map();
      socials.forEach(function (link) {
        if (!link || !link.player_id) return;
        var key = String(link.player_id);
        if (!socialsByPlayer.has(key)) socialsByPlayer.set(key, []);
        socialsByPlayer.get(key).push(link);
      });
      var playerId = new URLSearchParams(window.location.search).get('playerId');
      var player = players.find(function (item) {
        return String(item.player_id) === String(playerId);
      });

      function fmt(value) {
        if (value === null || value === undefined || value === '') return '—';
        return String(value);
      }
      function addField(container, label, value) {
        var wrapper = document.createElement('div');
        wrapper.className = 'field';
        var labelNode = document.createElement('span');
        labelNode.className = 'label';
        labelNode.textContent = label;
        var valueNode = document.createElement('span');
        valueNode.className = 'value';
        valueNode.textContent = fmt(value);
        wrapper.appendChild(labelNode);
        wrapper.appendChild(valueNode);
        container.appendChild(wrapper);
      }
      function teamLabel(team) {
        if (team.name) return fmt(team.name);
        if (team.id) return '球队 #' + fmt(team.id);
        return '—';
      }
      function amountLabel(transfer) {
        if (transfer.amount === null || transfer.amount === undefined) return '未披露';
        var numeric = Number(transfer.amount);
        if (Number.isFinite(numeric)) return numeric.toLocaleString('zh-CN');
        return fmt(transfer.amount_text || transfer.amount);
      }
      function statusLabel(transfer) {
        if (transfer.career_ended === true) return '职业生涯结束';
        if (transfer.completed === true) return '已完成';
        if (transfer.completed === false) return '未完成';
        return '—';
      }

      document.getElementById('generated').textContent = fmt(data.generated_at);
      var nameNode = document.getElementById('player-name');
      var subtitleNode = document.getElementById('player-subtitle');
      var avatarWrap = document.getElementById('avatar-wrap');
      var profile = document.getElementById('profile');
      var teamsNode = document.getElementById('teams');
      var socialLinksNode = document.getElementById('social-links');
      var socialCount = document.getElementById('social-count');
      var transferRows = document.getElementById('transfer-rows');
      var transferCount = document.getElementById('transfer-count');

      if (!player) {
        nameNode.textContent = '未找到球员';
        subtitleNode.textContent = playerId
          ? '没有找到 ID 为 ' + fmt(playerId) + ' 的球员。'
          : '请从球员列表点击球员姓名进入本页。';
        avatarWrap.replaceChildren(createAvatar(null, '?', false));
        socialLinksNode.replaceChildren(createSocialLinks([], false));
        socialCount.textContent = '';
        transferCount.textContent = '';
        return;
      }

      nameNode.textContent = fmt(player.display_name || player.common_name || player.name || ('球员 #' + player.player_id));
      subtitleNode.textContent = '球员 ID ' + fmt(player.player_id)
        + ' · ' + fmt(data.league && data.league.name)
        + ' · 赛季 ' + fmt(season.name || season.id)
        + ' · Sportmonks 赛季 ID ' + fmt(season.id);
      avatarWrap.replaceChildren(createAvatar(player.image_path, nameNode.textContent, false));

      [
        ['全名', player.name],
        ['常用名', player.common_name],
        ['出生日期', player.date_of_birth],
        ['国籍', player.nationality_name],
        ['位置', player.position_name],
        ['详细位置', player.detailed_position_name],
        ['身高', player.height_cm === null || player.height_cm === undefined ? null : player.height_cm + ' cm'],
        ['体重', player.weight_kg === null || player.weight_kg === undefined ? null : player.weight_kg + ' kg']
      ].forEach(function (field) { addField(profile, field[0], field[1]); });

      var teamList = Array.isArray(player.teams) ? player.teams : [];
      teamsNode.replaceChildren();
      if (!teamList.length) {
        var empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = '暂无当前球队记录。';
        teamsNode.appendChild(empty);
      } else {
        var list = document.createElement('div');
        list.className = 'profile';
        teamList.forEach(function (team) {
          addField(list, fmt(team.team_name), '球衣号码 ' + fmt(team.jersey_number));
        });
        teamsNode.appendChild(list);
      }

      var playerSocials = socialsByPlayer.get(String(player.player_id)) || [];
      socialCount.textContent = playerSocials.length
        ? '共 ' + playerSocials.length + ' 条公开链接'
        : '暂未收录公开社媒链接';
      socialLinksNode.replaceChildren(createSocialLinks(playerSocials, false));

      var transfers = Array.isArray(player.transfers) ? player.transfers.slice() : [];
      transfers.sort(function (a, b) {
        var dateCompare = String(b.transfer_date || '').localeCompare(String(a.transfer_date || ''));
        if (dateCompare !== 0) return dateCompare;
        return Number(b.id || 0) - Number(a.id || 0);
      });
      transferCount.textContent = '共 ' + transfers.length + ' 条已确认转会记录';
      transferRows.replaceChildren();
      if (!transfers.length) {
        var emptyRow = document.createElement('tr');
        var emptyCell = document.createElement('td');
        emptyCell.colSpan = 6;
        emptyCell.className = 'empty';
        emptyCell.textContent = '该球员暂无转会历史记录。';
        emptyRow.appendChild(emptyCell);
        transferRows.appendChild(emptyRow);
      } else {
        transfers.forEach(function (transfer) {
          var tr = document.createElement('tr');
          [
            fmt(transfer.transfer_date),
            fmt(transfer.type_name || transfer.type_code),
            teamLabel({ id: transfer.from_team_id, name: transfer.from_team_name }),
            teamLabel({ id: transfer.to_team_id, name: transfer.to_team_name }),
            amountLabel(transfer),
            statusLabel(transfer)
          ].forEach(function (value) {
            var td = document.createElement('td');
            if (value === '已完成') {
              var badge = document.createElement('span');
              badge.className = 'status';
              badge.textContent = value;
              td.appendChild(badge);
            } else {
              td.textContent = value;
            }
            tr.appendChild(td);
          });
          transferRows.appendChild(tr);
        });
      }
    })();
  </script>
</body>
</html>
`;

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is missing from .env.');
  const report = JSON.parse(runPsql({ databaseUrl, sql: SQL }));
  const safeJson = JSON.stringify(report)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const docDir = path.join(ROOT, 'doc');
  const dataPath = path.join(docDir, 'demo-data.js');
  const indexPath = path.join(docDir, 'scottish-premiership-demo.html');
  const detailPath = path.join(docDir, 'player-detail.html');
  const dataVersion = Date.now();
  await fsp.writeFile(dataPath, `window.DEMO_DATA = ${safeJson};\n`, 'utf8');
  await fsp.writeFile(
    indexPath,
    HTML_INDEX.replace('__DATA_VERSION__', String(dataVersion)),
    'utf8'
  );
  await fsp.writeFile(
    detailPath,
    HTML_DETAIL.replace('__DATA_VERSION__', String(dataVersion)),
    'utf8'
  );
  console.log(JSON.stringify({
    data: dataPath,
    index: indexPath,
    detail: detailPath,
    dataVersion,
    teams: report.summary.teams,
    players: report.summary.players,
    memberships: report.summary.memberships,
    transfers: report.summary.transfers,
    playersWithTransfers: report.summary.players_with_transfers
  }, null, 2));
}

main().catch(error => {
  console.error(`Demo report failed: ${error.message}`);
  process.exitCode = 1;
});
