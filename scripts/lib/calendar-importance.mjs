import { normalizeCalendarTitle } from './release-calendar-identity.mjs';
import { selectCalendarLeads, leadPlatformFamilies } from './release-calendar-selection.mjs';

const array = value => Array.isArray(value) ? value : [];
const names = values => [...new Set(values.filter(value => typeof value === 'string').map(value => normalizeCalendarTitle(value.replace(/[™®©]/g, ""))).filter(Boolean))];
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? Date.parse(`${value}T00:00:00Z`) : NaN;

/** Interest comes from substantive news entries, never previous calendar inclusion or naming knowledge. */
export function buildCalendarInterestHistory(editions, { editionDate, lookbackDays = 120, titleRegistry = {} } = {}) {
  const end = day(editionDate);
  const registry = titleRegistry.translations || titleRegistry;
  const result = [];
  for (const edition of array(editions)) {
    const date = day(edition.date);
    if (!Number.isFinite(date) || !Number.isFinite(end) || date >= end || date < end - lookbackDays * 86400000) continue;
    for (const entry of array(edition.entries)) {
      const title = entry.title;
      const registered = registry[title?.title_key] || {};
      const type = entry.subject?.kind || entry.subjectType || title?.subjectType || registered.subjectType;
      // Company/platform/industry news is not proof that a similarly named game was covered.
      if (!title || typeof title !== 'object' || (type && type !== 'game') || ['industry', 'rumors'].includes(entry.section)) continue;
      const explicitTitleNames = names([title.title_en, title.title_zh_cn]);
      const quotedSubjects = [...String(entry.headline || '').matchAll(/《([^》]+)》/g)].flatMap(match => names([match[1]]));
      const gameSpecificHeadline = quotedSubjects.some(name => explicitTitleNames.includes(name))
        && /游戏|玩法|发售|试玩|DLC|更新|扩展|关卡|剧情|实机|抢先体验|\bgame\b/i.test(`${entry.summary || ''} ${entry.releaseType || ''}`);
      if (type !== 'game' && !gameSpecificHeadline) continue;
      if (!entry.headline || !entry.summary || !array(entry.sources).some(source => /^https:\/\//.test(source.url || ''))) continue;
      const titleNames = names([title.title_en, title.title_zh_cn]);
      if (!titleNames.length) continue;
      result.push({ names: titleNames, registryIds: title.title_key ? [title.title_key] : [], entryId: entry.id, editionId: edition.id });
    }
  }
  return result;
}

function observations(lead) {
  return array(lead.observations).length ? lead.observations : [{ sourceId: lead.sourceId, sourceIds: lead.sources, family: lead.family }];
}
function signalsFor(lead, history, sourceSignals) {
  const titleNames = names([lead.title, ...array(lead.observations).map(row => row.title)]);
  // Match exact game titles. Do not use article-headline substrings, company identities or registry membership alone.
  const covered = history.find(row => array(row.names).some(name => titleNames.includes(name)));
  const signals = covered ? [{ level: 'strong', family: 'site-news', reason: 'recent-substantive-news', evidence: `${covered.editionId}/${covered.entryId}` }] : [];
  for (const observation of observations(lead)) {
    for (const id of [observation.sourceId, ...array(observation.sourceIds)]) {
      const signal = sourceSignals[id];
      if (!signal || !['strong', 'medium'].includes(signal.level) || !signal.family) continue;
      const spotlight = signal.spotlightUrl && observation.editorialSpotlight?.sourceUrl === signal.spotlightUrl
        && /^biggest games of [a-z]+ 20\d{2}$/i.test(observation.editorialSpotlight?.section || '');
      const previous = signals.findIndex(row => row.family === signal.family);
      const value = { level: spotlight ? 'strong' : signal.level, family: signal.family, reason: spotlight ? 'explicit-editorial-spotlight' : signal.reason || 'configured-editorial-source', evidence: spotlight ? `${observation.editorialSpotlight.sourceUrl}#${observation.editorialSpotlight.section}` : id };
      if (previous < 0) signals.push(value);
      else if (value.level === 'strong') signals[previous] = value;
    }
  }
  return signals;
}

/** A pre-fetch editorial gate; allCandidates is an internal discovery audit, not a verified public calendar. */
export function applyCalendarImportance(report, { config = {}, history = [], historyStatus = 'available' } = {}) {
  const policy = config.importance;
  if (!policy?.enabled) return report;
  const explorationLimit = Number.isInteger(policy.explorationCandidates) ? Math.max(0, Math.min(policy.explorationCandidates, 12)) : 4;
  const linkLimit = Number.isInteger(policy.reviewLinkBudget) ? Math.max(0, Math.min(policy.reviewLinkBudget, 12)) : 4;
  const sourceSignals = policy.sourceSignals || {};
  const original = report.allCandidates || report.candidates || [];
  const pool = original.map(lead => {
    const signals = signalsFor(lead, history, sourceSignals);
    const qualifies = lead.inBaseline || signals.some(signal => signal.level === 'strong') || new Set(signals.filter(signal => signal.level === 'medium').map(signal => signal.family)).size >= 2;
    return { ...lead, importance: { decision: qualifies ? 'selected' : 'candidate', reasons: lead.inBaseline ? ['published-baseline-recheck'] : qualifies ? ['editorial-interest'] : ['insufficient-interest-evidence'], signals } };
  });
  // Explore some unknowns even at cold start. No popular-source, known-name, review-count or studio-size bias.
  // Stable rotation prevents a permanently unexamined tail; four-family opportunities survive the cap.
  const remaining = pool.filter(row => row.importance.decision === 'candidate');
  const serial = Number.isFinite(day(report.editionDate)) ? Math.floor(day(report.editionDate) / 86400000) : 0;
  const offset = remaining.length ? serial % remaining.length : 0;
  const rotated = [...remaining.slice(offset), ...remaining.slice(0, offset)];
  const choose = (rows, limit) => {
    // Neutralize factual urgency/popularity tie-breakers only in this discovery lottery.
    const indexes = rows.map((row, index) => ({ ...row, date: String(index).padStart(8, '0'), dateConflict: false, dateConflictUncertain: false, dateConflictStatus: 'none', baselineChanged: false, knownTitle: false, crossSource: false, priority: 0, _explorationRow: row }));
    return selectCalendarLeads(indexes, limit).candidates.map(row => row._explorationRow);
  };
  // Most exploration goes to a positive but insufficient editorial signal; reserve one
  // opportunity for a true cold-start game rather than an endless established-title loop.
  const promising = rotated.filter(row => row.importance.signals.length);
  const cold = rotated.filter(row => !row.importance.signals.length);
  const exploratory = promising.length ? choose(promising, Math.max(0, explorationLimit - Number(cold.length > 0))) : choose(cold, explorationLimit);
  if (cold.length && exploratory.length < explorationLimit) exploratory.push(...choose(cold, 1));
  exploratory.push(...choose(rotated.filter(row => !exploratory.includes(row)), explorationLimit - exploratory.length));
  for (const row of exploratory) {
    row.importance = { ...row.importance, decision: 'exploration', reasons: ['bounded-discovery-opportunity'] };
  }
  for (const row of pool) {
    row.importance.needsAttention = row.importance.decision === 'candidate' && (row.importance.signals.length > 0 || leadPlatformFamilies(row).length >= 2);
    if (row.importance.needsAttention) row.importance.reasons.push('potential-interest-gap-review');
  }
  const selected = pool.filter(row => row.importance.decision !== 'candidate');
  const selectedUrls = new Set(selected.flatMap(row => [row.url, ...array(row.sourceUrls), ...array(row.observations).flatMap(obs => [obs.url, obs.announcementUrl])]).filter(Boolean));
  const links = [...new Map(array(report.reviewLinks).filter(link => typeof link.url === "string").map(link => [link.url, link])).values()];
  const matching = links.filter(link => selectedUrls.has(link.url));
  const unmatched = links.filter(link => !selectedUrls.has(link.url));
  const linkOffset = unmatched.length ? serial % unmatched.length : 0;
  const rotatedLinks = [...unmatched.slice(linkOffset), ...unmatched.slice(0, linkOffset)];
  // Matching links come first; a strict total task cap prevents RSS bypass (their URLs still receive candidate evidence).
  const exploratoryLinks = selectCalendarLeads(rotatedLinks.map((link, index) => ({ ...link, date: String(index).padStart(8, '0'), _link: link })), linkLimit).candidates.map(row => row._link);
  const admittedLinks = [...matching, ...exploratoryLinks].slice(0, linkLimit);
  const candidateSelection = selectCalendarLeads(selected, config.maxCandidates || 100);
  const summary = {
    version: 1, historyStatus, historyEntries: history.length, discovered: pool.length,
    interestSourceStatus: Object.fromEntries(Object.keys(sourceSignals).map(id => {
      const source = array(report.coverage).find(row => row.sourceId === id);
      return [id, { sourceStatus: source?.sourceStatus || 'unknown', parserStatus: source?.parserStatus || 'unknown' }];
    })),
    selected: pool.filter(row => row.importance.decision === 'selected').length,
    exploration: pool.filter(row => row.importance.decision === 'exploration').length,
    candidateOnly: pool.filter(row => row.importance.decision === 'candidate').length,
    needsAttention: pool.filter(row => row.importance.needsAttention).length,
    reviewLinksSelected: admittedLinks.length, reviewLinksDeferred: links.length - admittedLinks.length,
    explorationLimit, reviewLinkBudget: linkLimit,
    coverage: 'Selected research, not a complete release database. Missing interest evidence is not evidence of low quality.',
  };
  return {
    ...report,
    allCandidates: pool,
    admittedCandidates: selected,
    candidates: candidateSelection.candidates,
    deferredReviewLinks: links.filter(link => !admittedLinks.includes(link)),
    reviewLinks: admittedLinks,
    importanceSummary: summary,
    omittedCandidates: candidateSelection.capOmittedTasks,
    omissionTelemetry: { ...report.omissionTelemetry, interestDeferredTasks: summary.candidateOnly, capOmittedTasks: candidateSelection.capOmittedTasks },
    requiredChecks: [
      'Verify admitted selected and bounded discovery candidates before any publication; importance is not release evidence.',
      'Recheck every inherited release for postponements, cancellations, region/platform and early-access differences.',
      'Keep incomplete source/platform coverage explicit; do not refill excluded low-interest candidates through unbounded lookup.',
      'Candidate-only records are not review debts or confirmed public dates. Never delete an inherited release for absent interest signals.',
    ],
  };
}
