/**
 * Debug log viewer HTML (dev only). Served at GET /debug.
 */

export function renderDebugViewerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Arcane Debug</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-monospace, monospace; font-size: 12px; margin: 0; background: #0f172a; color: #e2e8f0; padding: 12px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px 0; }
    .tabs { display: flex; gap: 4px; margin-bottom: 12px; }
    .tabs button { padding: 8px 14px; border-radius: 6px 6px 0 0; border: 1px solid #334155; border-bottom: none; background: #1e293b; color: #94a3b8; cursor: pointer; }
    .tabs button.active { background: #334155; color: #e2e8f0; }
    .panel { display: none; }
    .panel.active { display: block; }
    .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .toolbar input, .toolbar select, .toolbar button { padding: 6px 10px; border-radius: 6px; border: 1px solid #334155; background: #1e293b; color: #e2e8f0; }
    .toolbar button { cursor: pointer; }
    .toolbar button:hover { background: #334155; }
    .toolbar button.primary { background: #0e7490; border-color: #06b6d4; }
    .toolbar button.primary:hover { background: #0891b2; }
    .banner { padding: 8px 12px; border-radius: 6px; background: #422006; color: #fde68a; margin-bottom: 12px; font-size: 11px; }
    .banner.ok { background: #14532d; color: #bbf7d0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #334155; vertical-align: top; }
    th { position: sticky; top: 0; background: #1e293b; z-index: 1; }
    .level { font-weight: 600; }
    .time { color: #94a3b8; white-space: nowrap; }
    .msg { max-width: 36em; word-break: break-word; cursor: pointer; }
    .msg:hover { text-decoration: underline; }
    .json { font-size: 11px; color: #cbd5e1; white-space: pre-wrap; word-break: break-all; max-width: 48em; }
    .json.collapsed { max-height: 2.4em; overflow: hidden; cursor: pointer; }
    tr:hover { background: #1e293b; }
    tr.hidden { display: none; }
    tr.expanded .json.collapsed { max-height: none; }
    .count { color: #94a3b8; margin-left: 8px; font-weight: normal; }
    .badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #334155; }
    .badge.worker { background: #4c1d95; }
    .trace-list { list-style: none; padding: 0; margin: 0; }
    .trace-list li { padding: 10px; border-bottom: 1px solid #334155; cursor: pointer; }
    .trace-list li:hover { background: #1e293b; }
    .trace-list li.selected { background: #334155; }
    .trace-detail { margin-top: 12px; max-height: 60vh; overflow: auto; }
    .prompt-card { border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .prompt-card h3 { margin: 0 0 8px 0; font-size: 13px; }
    .prompt-section { margin-top: 8px; }
    .prompt-section pre { background: #1e293b; padding: 8px; overflow: auto; max-height: 200px; white-space: pre-wrap; }
    .toast { position: fixed; bottom: 16px; right: 16px; background: #22c55e; color: #052e16; padding: 8px 16px; border-radius: 6px; display: none; z-index: 99; }
    .toast.show { display: block; }
  </style>
</head>
<body>
  <h1>Arcane Debug <span class="count" id="entryCount">(0 entries)</span></h1>
  <div id="workerBanner" class="banner" style="display:none"></div>
  <div class="tabs">
    <button type="button" data-tab="logs" class="active">Logs</button>
    <button type="button" data-tab="traces">Traces</button>
    <button type="button" data-tab="prompts">Prompts</button>
  </div>

  <div id="panel-logs" class="panel active">
    <div class="toolbar">
      <label>Level <select id="levelFilter"><option value="">all</option><option value="error">error</option><option value="warn">warn</option><option value="info">info</option><option value="debug">debug</option><option value="trace">trace</option></select></label>
      <label>Event <select id="eventFilter"><option value="">all</option></select></label>
      <label>Process <select id="processFilter"><option value="">all</option><option value="api">api</option><option value="worker">worker</option></select></label>
      <input type="text" id="traceIdFilter" placeholder="traceId" style="width:120px">
      <input type="text" id="chapterIdFilter" placeholder="chapterId" style="width:120px">
      <input type="text" id="projectIdFilter" placeholder="projectId" style="width:120px">
      <input type="text" id="jobIdFilter" placeholder="jobId" style="width:100px">
      <input type="text" id="search" placeholder="Search text..." style="min-width:140px">
      <select id="presetFilter" title="Presets">
        <option value="">Preset</option>
        <option value="errors">Errors only</option>
        <option value="translation">Translation events</option>
        <option value="pipeline">Pipeline / stages</option>
      </select>
      <label><input type="checkbox" id="autoRefresh"> Auto</label>
      <select id="refreshInterval"><option value="2">2s</option><option value="3" selected>3s</option><option value="5">5s</option><option value="10">10s</option></select>
      <button type="button" id="refreshBtn">Refresh</button>
      <button type="button" id="clearBtn">Clear</button>
      <button type="button" class="primary" id="copyVisibleBtn">Copy visible</button>
      <button type="button" id="copyCursorBtn">Copy for Cursor</button>
      <button type="button" id="copyJsonBtn">Copy JSON</button>
    </div>
    <table>
      <thead><tr><th></th><th>Time</th><th>Level</th><th>Process</th><th>Message</th><th>Payload</th><th>Actions</th></tr></thead>
      <tbody id="logBody"></tbody>
    </table>
  </div>

  <div id="panel-traces" class="panel">
    <div class="toolbar">
      <button type="button" id="refreshTracesBtn">Refresh traces</button>
      <button type="button" class="primary" id="copyTraceBtn" disabled>Copy trace</button>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <ul class="trace-list" id="traceList" style="flex:0 0 280px;max-height:70vh;overflow:auto"></ul>
      <div class="trace-detail" id="traceDetail" style="flex:1;min-width:300px"></div>
    </div>
  </div>

  <div id="panel-prompts" class="panel">
    <div class="toolbar">
      <span id="promptStatus"></span>
      <button type="button" id="refreshPromptsBtn">Refresh</button>
      <button type="button" id="clearPromptsBtn">Clear prompts</button>
    </div>
    <div id="promptList"></div>
  </div>

  <div class="toast" id="toast">Copied</div>

  <script>
(function () {
  var levelColors = { fatal: '#ef4444', error: '#ef4444', warn: '#eab308', info: '#22c55e', debug: '#06b6d4', trace: '#6b7280' };
  var allEntries = [];
  var selectedTraceId = null;
  var rowIndexMap = [];

  function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg || 'Copied';
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(function () { showToast('Copied'); }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied');
    });
  }

  function omitKeys(o, keys) {
    var r = {};
    for (var k of Object.keys(o)) if (keys.indexOf(k) === -1) r[k] = o[k];
    return r;
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function readUrlFilters() {
    var p = new URLSearchParams(location.search);
    if (p.get('level')) document.getElementById('levelFilter').value = p.get('level');
    if (p.get('event')) document.getElementById('eventFilter').value = p.get('event');
    if (p.get('chapterId')) document.getElementById('chapterIdFilter').value = p.get('chapterId');
    if (p.get('projectId')) document.getElementById('projectIdFilter').value = p.get('projectId');
    if (p.get('traceId')) document.getElementById('traceIdFilter').value = p.get('traceId');
    if (p.get('jobId')) document.getElementById('jobIdFilter').value = p.get('jobId');
    if (p.get('q')) document.getElementById('search').value = p.get('q');
    if (p.get('tab')) activateTab(p.get('tab'));
  }

  function writeUrlFilters() {
    var p = new URLSearchParams();
    var level = document.getElementById('levelFilter').value;
    var event = document.getElementById('eventFilter').value;
    var chapterId = document.getElementById('chapterIdFilter').value.trim();
    var projectId = document.getElementById('projectIdFilter').value.trim();
    var traceId = document.getElementById('traceIdFilter').value.trim();
    var jobId = document.getElementById('jobIdFilter').value.trim();
    var q = document.getElementById('search').value.trim();
    if (level) p.set('level', level);
    if (event) p.set('event', event);
    if (chapterId) p.set('chapterId', chapterId);
    if (projectId) p.set('projectId', projectId);
    if (traceId) p.set('traceId', traceId);
    if (jobId) p.set('jobId', jobId);
    if (q) p.set('q', q);
    var tab = document.querySelector('.tabs button.active');
    if (tab && tab.dataset.tab !== 'logs') p.set('tab', tab.dataset.tab);
    var qs = p.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function matchesPreset(e, preset) {
    if (!preset) return true;
    if (preset === 'errors') return e.level === 'error' || e.level === 'fatal';
    if (preset === 'translation') {
      var ev = e.event || '';
      return ev.indexOf('translation') === 0 || ev.indexOf('pipeline') === 0;
    }
    if (preset === 'pipeline') {
      var m = (e.msg || '').toLowerCase();
      return m.indexOf('pipeline') !== -1 || m.indexOf('stage') !== -1 || m.indexOf('chunk') !== -1;
    }
    return true;
  }

  function entryMatchesFilters(e) {
    var level = document.getElementById('levelFilter').value;
    var event = document.getElementById('eventFilter').value;
    var process = document.getElementById('processFilter').value;
    var traceId = document.getElementById('traceIdFilter').value.trim();
    var chapterId = document.getElementById('chapterIdFilter').value.trim();
    var projectId = document.getElementById('projectIdFilter').value.trim();
    var jobId = document.getElementById('jobIdFilter').value.trim();
    var q = document.getElementById('search').value.toLowerCase();
    var preset = document.getElementById('presetFilter').value;
    if (level && e.level !== level) return false;
    if (event && e.event !== event) return false;
    if (process && e.process !== process) return false;
    if (traceId && e.traceId !== traceId && e.jobId !== traceId && e.requestId !== traceId) return false;
    if (chapterId && e.chapterId !== chapterId) return false;
    if (projectId && e.projectId !== projectId) return false;
    if (jobId && e.jobId !== jobId) return false;
    if (!matchesPreset(e, preset)) return false;
    if (q) {
      var text = JSON.stringify(e).toLowerCase();
      if (text.indexOf(q) === -1) return false;
    }
    return true;
  }

  function getVisibleEntries() {
    return allEntries.filter(entryMatchesFilters);
  }

  function renderLogRow(e, idx) {
    var level = e.level || '';
    var color = levelColors[level] || '#94a3b8';
    var payload = JSON.stringify(omitKeys(e, ['time', 'level', 'msg']), null, 2);
    var proc = e.process || 'api';
    var corr = e.traceId || e.jobId || e.requestId || '';
    return '<tr data-idx="' + idx + '" data-level="' + escapeHtml(level) + '">' +
      '<td><input type="checkbox" class="row-select" data-idx="' + idx + '"></td>' +
      '<td class="time">' + escapeHtml(String(e.time || '')) + '</td>' +
      '<td class="level" style="color:' + color + '">' + escapeHtml(level) + '</td>' +
      '<td><span class="badge' + (proc === 'worker' ? ' worker' : '') + '">' + escapeHtml(proc) + '</span></td>' +
      '<td class="msg" title="Click to expand payload">' + escapeHtml(String(e.msg || '')) + (corr ? ' <span class="badge">' + escapeHtml(String(corr).slice(0, 8)) + '</span>' : '') + '</td>' +
      '<td class="json collapsed">' + escapeHtml(payload) + '</td>' +
      '<td><button type="button" class="copy-row-btn" data-idx="' + idx + '">Copy</button> ' +
      (corr ? '<button type="button" class="copy-trace-row-btn" data-corr="' + escapeHtml(corr) + '">Trace</button>' : '') +
      '</td></tr>';
  }

  function applyFilters() {
    var rows = document.querySelectorAll('#logBody tr');
    rows.forEach(function (tr) {
      var idx = parseInt(tr.dataset.idx, 10);
      var e = allEntries[idx];
      tr.classList.toggle('hidden', !e || !entryMatchesFilters(e));
    });
    writeUrlFilters();
  }

  function updateEventFilter(events) {
    var sel = document.getElementById('eventFilter');
    var cur = sel.value;
    sel.innerHTML = '<option value="">all</option>';
    (events || []).forEach(function (ev) {
      var o = document.createElement('option');
      o.value = ev;
      o.textContent = ev;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  }

  function updateTable(data) {
    allEntries = data.entries || [];
    rowIndexMap = allEntries.map(function (_, i) { return i; });
    document.getElementById('entryCount').textContent = '(' + allEntries.length + ' entries)';
    var meta = data.meta || {};
    var banner = document.getElementById('workerBanner');
    if (meta.workerBridge) {
      banner.className = 'banner ok';
      banner.style.display = 'block';
      banner.textContent = 'Worker log bridge: active (REDIS_URL). Async job logs appear with process=worker.';
    } else {
      banner.style.display = 'block';
      banner.className = 'banner';
      banner.textContent = 'Worker logs: only in worker terminal unless REDIS_URL is set (npm run dev:full).';
    }
    updateEventFilter(meta.events);
    document.getElementById('logBody').innerHTML = allEntries.map(function (e, i) { return renderLogRow(e, i); }).join('');
    applyFilters();
  }

  function fetchLogs() {
    return fetch('/api/debug/logs?newestFirst=1').then(function (r) { return r.json(); }).then(updateTable);
  }

  function activateTab(name) {
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (name === 'traces') loadTraces();
    if (name === 'prompts') loadPrompts();
    writeUrlFilters();
  }

  document.querySelectorAll('.tabs button').forEach(function (btn) {
    btn.addEventListener('click', function () { activateTab(btn.dataset.tab); });
  });

  ['levelFilter', 'eventFilter', 'processFilter', 'presetFilter'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  ['traceIdFilter', 'chapterIdFilter', 'projectIdFilter', 'jobIdFilter', 'search'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', applyFilters);
  });

  document.getElementById('logBody').addEventListener('click', function (ev) {
    var t = ev.target;
    if (t.classList.contains('msg') || t.classList.contains('json')) {
      var tr = t.closest('tr');
      if (tr) tr.classList.toggle('expanded');
    }
    if (t.classList.contains('copy-row-btn')) {
      var idx = t.dataset.idx;
      fetch('/api/debug/export?format=row&traceId=').then(function () {
        return fetch('/api/debug/export?format=markdown&ids=' + idx + '&visibleOnly=1');
      });
      copyText(formatRowClient(allEntries[parseInt(idx, 10)]));
    }
    if (t.classList.contains('copy-trace-row-btn')) {
      var corr = t.dataset.corr;
      fetch('/api/debug/export?format=cursor&traceId=' + encodeURIComponent(corr)).then(function (r) { return r.text(); }).then(copyText);
    }
  });

  function formatRowClient(e) {
    if (!e) return '';
    return '[' + (e.time || '') + '] ' + (e.level || '') + ' ' + (e.msg || '') + '\\n' + JSON.stringify(omitKeys(e, ['time', 'level', 'msg']), null, 2);
  }

  document.getElementById('copyVisibleBtn').addEventListener('click', function () {
    var visible = getVisibleEntries();
    fetch('/api/debug/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: visible, format: 'markdown' })
    }).catch(function () {
      var lines = visible.map(formatRowClient);
      copyText('## Visible logs\\n\\n' + lines.join('\\n\\n'));
    });
    var lines = visible.map(formatRowClient);
    copyText('## Visible logs (' + visible.length + ')\\n\\n' + lines.join('\\n\\n'));
  });

  document.getElementById('copyCursorBtn').addEventListener('click', function () {
    var traceId = document.getElementById('traceIdFilter').value.trim();
    var visible = getVisibleEntries();
    if (traceId) {
      fetch('/api/debug/export?format=cursor&traceId=' + encodeURIComponent(traceId)).then(function (r) { return r.text(); }).then(copyText);
      return;
    }
    if (visible.length > 0 && visible[0].traceId) {
      fetch('/api/debug/export?format=cursor&traceId=' + encodeURIComponent(visible[0].traceId)).then(function (r) { return r.text(); }).then(copyText);
      return;
    }
    var lines = visible.map(formatRowClient);
    copyText('## Arcane debug context\\n\\n' + lines.join('\\n\\n'));
  });

  document.getElementById('copyJsonBtn').addEventListener('click', function () {
    copyText(JSON.stringify(getVisibleEntries(), null, 2));
  });

  document.getElementById('clearBtn').addEventListener('click', function () {
    if (confirm('Clear in-memory log buffer?')) location.href = '/debug/clear';
  });
  document.getElementById('refreshBtn').addEventListener('click', fetchLogs);

  var autoRefreshTimer = null;
  function setupAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    if (document.getElementById('autoRefresh').checked) {
      var sec = parseInt(document.getElementById('refreshInterval').value, 10) || 3;
      autoRefreshTimer = setInterval(fetchLogs, sec * 1000);
    }
  }
  document.getElementById('autoRefresh').addEventListener('change', setupAutoRefresh);
  document.getElementById('refreshInterval').addEventListener('change', setupAutoRefresh);

  function loadTraces() {
    fetch('/api/debug/traces').then(function (r) { return r.json(); }).then(function (data) {
      var list = document.getElementById('traceList');
      list.innerHTML = '';
      (data.traces || []).forEach(function (t) {
        var li = document.createElement('li');
        li.dataset.traceId = t.traceId;
        var label = (t.chapterId ? t.chapterId.slice(0, 8) + '… ' : '') + (t.lastMsg || t.traceId).slice(0, 60);
        li.innerHTML = '<strong>' + escapeHtml(t.traceId.slice(0, 8)) + '…</strong> ' +
          (t.errorCount ? '<span style="color:#ef4444">' + t.errorCount + ' err</span> ' : '') +
          escapeHtml(label) + '<br><span style="color:#94a3b8;font-size:10px">' + escapeHtml(t.lastTime) + ' · ' + t.entryCount + ' entries</span>';
        li.addEventListener('click', function () {
          selectedTraceId = t.traceId;
          document.querySelectorAll('#traceList li').forEach(function (x) { x.classList.remove('selected'); });
          li.classList.add('selected');
          document.getElementById('copyTraceBtn').disabled = false;
          fetch('/api/debug/traces/' + encodeURIComponent(t.traceId)).then(function (r) { return r.json(); }).then(renderTraceDetail);
        });
        list.appendChild(li);
      });
    });
  }

  function renderTraceDetail(data) {
    var el = document.getElementById('traceDetail');
    var entries = (data.entries || []).slice().reverse();
    var html = '<h3>Trace ' + escapeHtml(data.traceId || '') + '</h3><table><thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead><tbody>';
    entries.forEach(function (e) {
      var color = levelColors[e.level] || '#94a3b8';
      html += '<tr><td class="time">' + escapeHtml(e.time || '') + '</td><td style="color:' + color + '">' + escapeHtml(e.level || '') + '</td><td>' + escapeHtml(e.msg || '') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  document.getElementById('refreshTracesBtn').addEventListener('click', loadTraces);
  document.getElementById('copyTraceBtn').addEventListener('click', function () {
    if (!selectedTraceId) return;
    fetch('/api/debug/export?format=cursor&traceId=' + encodeURIComponent(selectedTraceId)).then(function (r) { return r.text(); }).then(copyText);
  });

  function loadPrompts() {
    fetch('/api/debug/prompts').then(function (r) { return r.json(); }).then(function (data) {
      document.getElementById('promptStatus').textContent = data.enabled
        ? 'Capture ON (DEBUG_CAPTURE_LLM=1)'
        : 'Capture OFF — set DEBUG_CAPTURE_LLM=1 in .env and restart';
      var list = document.getElementById('promptList');
      list.innerHTML = '';
      (data.captures || []).forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'prompt-card';
        card.innerHTML = '<h3>' + escapeHtml(c.model) + ' · ' + escapeHtml(c.method) + ' · ' + escapeHtml(c.time) + '</h3>' +
          '<div>trace: ' + escapeHtml(c.traceId || '—') + ' · stage: ' + escapeHtml(c.stage || '—') + '</div>' +
          '<div class="prompt-section"><strong>System</strong><pre>' + escapeHtml(c.systemPreview) + '</pre></div>' +
          '<div class="prompt-section"><strong>User</strong><pre>' + escapeHtml(c.userPreview) + '</pre></div>' +
          '<div class="prompt-section"><strong>Response</strong><pre>' + escapeHtml(c.responsePreview) + '</pre></div>' +
          '<button type="button" class="copy-prompt-btn">Copy for agent</button>';
        card.querySelector('.copy-prompt-btn').addEventListener('click', function () {
          var md = '## LLM call ' + c.model + '\\n\\n### System\\n' + c.systemPreview + '\\n\\n### User\\n' + c.userPreview + '\\n\\n### Response\\n' + c.responsePreview;
          copyText(md);
        });
        list.appendChild(card);
      });
      if (!(data.captures || []).length) list.innerHTML = '<p style="color:#94a3b8">No captures yet.</p>';
    });
  }

  document.getElementById('refreshPromptsBtn').addEventListener('click', loadPrompts);
  document.getElementById('clearPromptsBtn').addEventListener('click', function () {
    if (confirm('Clear prompt captures?')) location.href = '/debug/clear-prompts';
  });

  readUrlFilters();
  fetchLogs();
  if (location.hash === '#prompts') activateTab('prompts');
})();
  </script>
</body>
</html>`;
}
