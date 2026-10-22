/**
 * Research-only PULSE matchmaker. NOT a production admission controller.
 * No persistence, auth, blocklists, idempotency or concurrency protection.
 * Users may opt into 'balanced' or 'open'; we never secretly switch modes.
 * 'balanced' uses 2/2 or 3/3 for explicitly self-described man/woman participants.
 * Open rooms include all gender identities / unknown.
 */
const ALLOWED_MODES = new Set(['open', 'balanced']);

// Maximize assigned people without invalid rooms; secondarily minimize room count.
function partitionCounts(count, allowedSizes) {
  const dp = Array(count + 1).fill(null);
  dp[0] = [];
  for (let total = 1; total <= count; total++) {
    for (const size of allowedSizes) {
      const prior = dp[total - size];
      if (total < size || !prior) continue;
      const candidate = [...prior, size];
      if (!dp[total] || candidate.length < dp[total].length) dp[total] = candidate;
    }
  }
  for (let possible = count; possible >= 0; possible--) {
    if (dp[possible]) return dp[possible];
  }
  return [];
}

/** @typedef {{id:string, age:number, status:'active'|'suspended', language:string, topic:string,
 * slot:string, mode:'open'|'balanced', gender?:string, joinedAt:number}} Candidate */

export function matchGroups(candidates, { minSize = 4, maxSize = 6 } = {}) {
  if (minSize !== 4 || maxSize !== 6) throw new Error('Spike supports group sizes 4..6 only');
  const valid = candidates.filter((u) =>
    u && typeof u.id === 'string' && u.id &&
    Number.isInteger(u.age) && u.age >= 18 && u.status === 'active' &&
    typeof u.language === 'string' && u.language &&
    typeof u.topic === 'string' && u.topic &&
    typeof u.slot === 'string' && u.slot &&
    ALLOWED_MODES.has(u.mode) && Number.isFinite(u.joinedAt)
  );

  // Prevent duplicate candidate identities; the server must enforce uniqueness transactionally.
  const seen = new Set();
  const unique = valid.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
  const pools = new Map();
  for (const u of unique) {
    const key = JSON.stringify([u.language, u.topic, u.slot, u.mode]);
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(u);
  }

  const rooms = [], waiting = [];
  for (const [key, pool] of pools) {
    const [language, topic, slot, mode] = JSON.parse(key);
    pool.sort((a,b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
    if (mode === 'open') {
      for (const size of partitionCounts(pool.length, [6,5,4])) {
        rooms.push({ language, topic, slot, mode, members: pool.splice(0,size).map(u=>u.id) });
      }
      waiting.push(...pool.map(u=>u.id));
      continue;
    }
    const men = pool.filter(u=>u.gender==='man');
    const women = pool.filter(u=>u.gender==='woman');
    // Partition matched pairs as 3+3 or 2+2, avoiding 4 pairs -> 3+3 plus two stranded.
    const pairSizes = partitionCounts(Math.min(men.length, women.length), [3,2]);
    for (const pairCount of pairSizes) {
      const group = men.splice(0,pairCount).concat(women.splice(0,pairCount));
      rooms.push({ language, topic, slot, mode, members: group.map(u=>u.id) });
    }
    const assigned = new Set(rooms.filter(r=>r.language===language && r.topic===topic && r.slot===slot && r.mode===mode).flatMap(r=>r.members));
    waiting.push(...pool.filter(u=>!assigned.has(u.id)).map(u=>u.id));
  }
  return { rooms, waiting };
}
