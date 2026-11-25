// Scannor dashboard: renders one scan from /api/scan (live) or /data/latest.json (last CLI run).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (n) => (n == null ? '–' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);
const ago = (ms) => {
  if (!ms) return '–';
  const h = (Date.now() - ms) / 3.6e6;
  return h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};
const safeUrl = (u) => (/^https:\/\//.test(u) ? u : null);

let scan = null;
let filter = 'usable';

async function load(force = false) {
  const btn = $('refresh');
  btn.disabled = true;
  $('stamp').textContent = 'scanning…';
  try {
    let res = await fetch(`/api/scan${force ? `?t=${Date.now()}` : ''}`);
    if (!res.ok) res = await fetch('/data/latest.json');
    scan = await res.json();
    render();
  } catch (e) {
    $('stamp').textContent = 'scan failed';
    $('idea-list').innerHTML = `<p class="empty">Could not load a scan: ${esc(e.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
}

function render() {
  const s = scan;
  $('stamp').textContent = `scan ${new Date(s.generatedAt).toLocaleTimeString()} · ${(s.durationMs / 1000).toFixed(1)}s`;
  const heat = $('heat');
  heat.textContent = `culture meta ×${(s.cultureHeat ?? 1).toFixed(1)}`;
  heat.className = `pill${(s.cultureHeat ?? 1) >= 1.2 ? ' hot' : ''}`;
  heat.title = 'How hard meme-site / KYM coins are running right now (1.0 cold, 1.4 hot)';
  $('sources').innerHTML = s.sources.map((x) => `<span class="src${x.ok ? '' : ' bad'}" title="${esc(x.detail)}">${esc(x.name)}</span>`).join('');
  $('llm').textContent = s.llm.enabled ? (s.llm.ok ? `Beta plays by ${s.llm.model}: ${s.llm.detail}.` : `Claude: ${s.llm.detail}. Showing rule-based ideas.`) : 'Claude is off for this scan; showing rule-based culture ideas. Beta plays need ANTHROPIC_API_KEY.';
  renderIdeas();
  renderSide();
}

function renderIdeas() {
  const pick = {
    usable: (i) => i.availability.status === 'open' || i.availability.status === 'dead',
    beta: (i) => i.kind === 'beta',
    culture: (i) => i.kind === 'culture' || i.kind === 'mascot',
    all: () => true,
  }[filter];
  const list = scan.ideas.filter(pick);
  if (!list.length) {
    $('idea-list').innerHTML = '<p class="empty">Nothing here this scan.</p>';
    return;
  }
  $('idea-list').innerHTML = list.map(ideaCard).join('');
}

function ideaCard(i) {
  const color = i.score >= 70 ? 'var(--green)' : i.score >= 45 ? 'var(--amber)' : 'var(--mute)';
  const lane = i.availability.status;
  const best = i.availability.matches[0];
  const ev = i.evidence
    .map((e) => (safeUrl(e) ? `<a href="${esc(e)}" target="_blank" rel="noopener">${esc(e.replace(/^https:\/\/(www\.)?/, '').slice(0, 60))}</a>` : `<span>${esc(e)}</span>`))
    .join('');
  return `<article class="idea ${lane}">
    <div class="score" style="--s:${i.score};--c:${color}"><span>${i.score}</span></div>
    <div>
      <h4>${esc(i.name)} <span class="ticker">$${esc(i.ticker)}</span></h4>
      <div class="badges">
        <span class="b ${lane}">${lane === 'open' ? 'open lane' : lane === 'dead' ? 'only dead coins' : lane}</span>
        <span class="b">${esc(i.kind)}${i.parent ? ` · off $${esc(String(i.parent).replace(/^\$/, ''))}` : ''}</span>
        ${i.source === 'claude' ? '<span class="b claude">claude</span>' : ''}
      </div>
      <p>${esc(i.angle)}</p>
      <p class="why">${esc(i.whyNow)}</p>
      ${i.art ? `<p class="art">🎨 ${esc(i.art)}</p>` : ''}
      ${i.risk ? `<p class="why">⚠ ${esc(i.risk)}</p>` : ''}
      ${i.firstTweet ? `<div class="tweet">${esc(i.firstTweet)}<button class="btn copy" data-copy="${esc(i.firstTweet)}">copy</button></div>` : ''}
      ${best ? `<div class="taken-by">Existing: ${esc(best.name)} ($${esc(best.symbol)}) · now ${usd(best.marketCapUsd)} · peak ${usd(best.athMarketCapUsd)} · ${best.ageHours ?? '?'}h old</div>` : ''}
      ${ev ? `<div class="ev">${ev}</div>` : ''}
    </div>
  </article>`;
}

function renderSide() {
  const s = scan;
  $('runners').innerHTML = s.runners.length
    ? s.runners.slice(0, 15).map((r) => {
        const ch = r.priceChange24hPct;
        const link = safeUrl(r.dexUrl);
        return `<div class="row"><div><b>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">$${esc(r.symbol)}</a>` : `$${esc(r.symbol)}`}</b> <span class="sub">${esc(r.name)}</span><div class="sub">vol ${usd(r.volume24hUsd)} · cap ${usd(r.marketCapUsd)} · ${ago(r.createdAt)}</div></div><div class="${ch >= 0 ? 'up' : 'down'} mono">${ch == null ? '' : `${ch > 0 ? '+' : ''}${Math.round(ch)}%`}</div></div>`;
      }).join('')
    : '<p class="empty">No runners cleared the screen.</p>';
  $('narratives').innerHTML = s.narratives.length
    ? s.narratives.slice(0, 12).map((n) => `<div class="row"><div>${n.rising ? '<span class="up">↑</span> ' : ''}<b>${esc(n.term)}</b><div class="sub">${n.runners.map((x) => '$' + esc(x)).join(' ')}</div></div><div class="mono">${n.weight}</div></div>`).join('')
    : '<p class="empty">No theme is shared across runners yet.</p>';
  $('threads').innerHTML = s.threads.slice(0, 12).map((t) => `<div class="row"><div><a href="${esc(t.url)}" target="_blank" rel="noopener">/${esc(t.board)}/</a> ${esc(t.subject || t.excerpt.slice(0, 70))}<div class="sub">${t.replies} replies</div></div><div class="mono">${t.velocity}/h</div></div>`).join('');
  $('kym').innerHTML = s.kym.slice(0, 15).map((k) => `<div class="row"><div><a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.title)}</a></div><div class="sub">${esc(k.list)}</div></div>`).join('');
}

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('.tab');
  if (tab) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t === tab));
    filter = tab.dataset.filter;
    if (scan) renderIdeas();
  }
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      copy.textContent = 'copied';
      setTimeout(() => (copy.textContent = 'copy'), 1200);
    } catch {
      copy.textContent = 'copy failed';
    }
  }
});
$('refresh').addEventListener('click', () => load(true));
load();
setInterval(() => load(), 10 * 60_000);
